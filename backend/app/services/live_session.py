"""
Per-connection state for the live camera: the active liveness ("turn your head") challenge.

Flow for a recognised, passively-live face that isn't marked yet:
  1. Issue a random challenge (turn left / turn right) instead of marking straight away.
  2. Follow that face across frames. A turned face often isn't recognised any more, so it is
     followed by position, not identity.
  3. Once its yaw passes the threshold in the requested direction, mark attendance using the
     frontal frame's score and embedding. No turn within the time limit: short cooldown, then retry.
A printed photo or a still on a phone can't turn (see preprocessing.yaw_ratio), and the random
direction defeats a pre-recorded head-turn video.
"""
import math
import random
import time
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Set

import numpy as np
from sqlalchemy.orm import Session

from app.db.models import Lecture
from app.repositories.lecture_repo import LectureRepository
from app.schemas.recognition import RecognitionResult
from app.services.recognition_service import Identified, RecognitionService, get_recognition_service

# Calibration knob: yaw_ratio of ~0.15 is roughly a 25-30 degree head turn. Raise it if people pass
# with a small twitch; lower it if genuine turns are missed on your camera.
TURN_THRESHOLD = 0.15
# Sign of yaw_ratio for each action in an UNMIRRORED frame (the browser always sends unmirrored)
ACTIONS = {"turn_left": 1.0, "turn_right": -1.0}
CHALLENGE_SECONDS = 8.0
RETRY_COOLDOWN_SECONDS = 3.0
FOLLOW_DISTANCE = 0.6  # max centre movement between frames, as a fraction of the face box size
LECTURE_CACHE_SECONDS = 30.0  # re-read the selected lecture at most this often (each read is a DB round trip)


@dataclass
class _Pending:
    ident: Identified  # the frontal frame that was recognised
    action: str
    started: float
    bbox: List[int]  # last known position


def _centre(bbox: List[int]):
    x, y, w, h = bbox
    return x + w / 2.0, y + h / 2.0


class LiveSession:
    def __init__(
        self,
        service: Optional[RecognitionService] = None,
        clock: Callable[[], float] = time.monotonic,
        rng: Optional[random.Random] = None,
    ):
        self._service = service
        self.clock = clock
        self.rng = rng or random.Random()
        self.pending: Dict[int, _Pending] = {}
        self.cooldown_until: Dict[int, float] = {}
        self._lecture: Optional[Lecture] = None
        self._lecture_key: Optional[int] = None
        self._lecture_loaded_at = -math.inf

    @property
    def service(self) -> RecognitionService:
        if self._service is None:
            self._service = get_recognition_service()
        return self._service

    def process(
        self,
        db: Session,
        img_bgr: np.ndarray,
        *,
        auto_mark: bool = True,
        lecture_id: Optional[int] = None,
        challenge: bool = True,
    ) -> List[RecognitionResult]:
        faces = self.service.identify_faces(db, img_bgr, max_faces=4)
        return self.step(db, faces, auto_mark=auto_mark, lecture=self._lecture_for(db, lecture_id), challenge=challenge)

    def _lecture_for(self, db: Session, lecture_id: Optional[int]) -> Optional[Lecture]:
        """Selected lecture, cached so frames with nobody in view don't touch the database."""
        now = self.clock()
        if lecture_id != self._lecture_key or now - self._lecture_loaded_at > LECTURE_CACHE_SECONDS:
            self._lecture = LectureRepository(db).get_active(lecture_id) if lecture_id else None
            if self._lecture is not None:
                # Detach it: a later commit in this session would otherwise expire its attributes,
                # and the next frame (a different session) couldn't reload them.
                db.expunge(self._lecture)
            self._lecture_key, self._lecture_loaded_at = lecture_id, now
        return self._lecture

    def step(
        self,
        db: Session,
        faces: List[Identified],
        *,
        auto_mark: bool,
        lecture: Optional[Lecture],
        challenge: bool,
    ) -> List[RecognitionResult]:
        now = self.clock()
        for sid, p in list(self.pending.items()):
            if now - p.started > CHALLENGE_SECONDS:
                del self.pending[sid]
                self.cooldown_until[sid] = now + RETRY_COOLDOWN_SECONDS
                self.service.record_failed_check(db, sid, lecture)

        claimed: Set[int] = set()
        results: List[RecognitionResult] = []

        for ident in faces:
            result = ident.result
            pending = self._follow(ident, claimed)

            if pending is not None:
                sid = pending.ident.student.id
                claimed.add(sid)
                pending.bbox = result.bbox
                if ident.yaw * ACTIONS[pending.action] >= TURN_THRESHOLD:
                    del self.pending[sid]
                    self.service.mark(db, pending.ident, lecture)
                    pending.ident.result.challenge = None
                # Show the challenged student's identity even while their turned face isn't recognised
                results.append(pending.ident.result.model_copy(update={"bbox": result.bbox}))
                continue

            if result.status != "MATCH" or not auto_mark:
                results.append(result)
                continue

            if not challenge:
                self.service.mark(db, ident, lecture)
                results.append(result)
                continue

            blocked = self.service.blocked_reason(db, ident.student, lecture)
            if blocked:
                result.attendance = blocked
            elif self.cooldown_until.get(ident.student.id, 0.0) > now:
                result.attendance = "CHALLENGE_FAILED"
            else:
                action = self.rng.choice(sorted(ACTIONS))
                self.pending[ident.student.id] = _Pending(ident, action, now, result.bbox)
                claimed.add(ident.student.id)
                result.attendance = "CHALLENGE"
                result.challenge = action
            results.append(result)

        return results

    def _follow(self, ident: Identified, claimed: Set[int]) -> Optional[_Pending]:
        """The pending challenge this face belongs to: by identity if recognised, else by position."""
        result = ident.result
        if result.student is not None:
            p = self.pending.get(result.student.id)
            if p is not None and result.student.id not in claimed:
                return p
            if result.status == "MATCH":
                return None  # clearly someone else
        if not result.bbox:
            return None

        cx, cy = _centre(result.bbox)
        best, best_dist = None, math.inf
        for sid, p in self.pending.items():
            if sid in claimed:
                continue
            px, py = _centre(p.bbox)
            dist = math.hypot(cx - px, cy - py)
            if dist <= FOLLOW_DISTANCE * max(p.bbox[2], p.bbox[3]) and dist < best_dist:
                best, best_dist = p, dist
        return best
