import asyncio
import logging
import json
import time
from typing import Optional
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    UploadFile,
    File,
    Form,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.db.database import get_db, SessionLocal
from app.repositories.lecture_repo import LectureRepository
from app.services.live_session import LiveSession
from app.services.recognition_service import get_recognition_service
from app.schemas.recognition import RecognitionResult
from app.cv.preprocessing import decode_image_bytes, decode_base64_image

logger = logging.getLogger("attendance.api.recognition")
router = APIRouter(prefix="/api/recognition", tags=["Recognition"])


class RecognitionRequestPayload(BaseModel):
    image_base64: str
    auto_mark: bool = True
    lecture_id: Optional[int] = None


def _lecture(db: Session, lecture_id: Optional[int]):
    if lecture_id is None:
        return None
    lecture = LectureRepository(db).get_active(lecture_id)
    if lecture is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Lecture {lecture_id} not found.")
    return lecture


@router.post("/test", response_model=RecognitionResult)
def test_recognition(
    image: Optional[UploadFile] = File(None),
    image_base64: Optional[str] = Form(None),
    auto_mark: bool = Form(True),
    lecture_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
):
    """
    Evaluate face recognition on a static image / frame:
    - Single image verification
    - Anti-spoofing liveness check
    - pgvector cosine distance matching in Neon
    - Idempotent attendance record creation (if matched and live)
    """
    img_bgr = None
    if image is not None:
        content = image.file.read()
        try:
            img_bgr = decode_image_bytes(content)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid image file: {str(e)}",
            )
    elif image_base64 and image_base64.strip():
        try:
            img_bgr = decode_base64_image(image_base64)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid base64 image: {str(e)}",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An image must be provided via file upload or image_base64.",
        )

    service = get_recognition_service()
    return service.recognize_single_image(db, img_bgr, auto_mark=auto_mark, lecture=_lecture(db, lecture_id))


@router.post("/test-json", response_model=RecognitionResult)
def test_recognition_json(
    payload: RecognitionRequestPayload,
    db: Session = Depends(get_db),
):
    """JSON-body variant of recognition test for easy client-side invocation."""
    try:
        img_bgr = decode_base64_image(payload.image_base64)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid base64 image data: {str(e)}",
        )

    service = get_recognition_service()
    return service.recognize_single_image(
        db, img_bgr, auto_mark=payload.auto_mark, lecture=_lecture(db, payload.lecture_id)
    )


def _process_frame(session: LiveSession, msg: dict) -> list:
    """Blocking decode + inference + DB work; run off the event loop."""
    img_bgr = decode_base64_image(msg["image"])
    lecture_id = msg.get("lecture_id")
    db = SessionLocal()
    try:
        results = session.process(
            db,
            img_bgr,
            auto_mark=bool(msg.get("auto_mark", True)),
            lecture_id=int(lecture_id) if lecture_id else None,
            challenge=bool(msg.get("challenge", True)),
        )
    finally:
        db.close()
    return [r.model_dump() for r in results]


@router.websocket("/ws")
async def websocket_recognition(websocket: WebSocket):
    """
    Real-time bidirectional WebSocket stream for live webcam attendance.
    Message: {"image": <base64 jpeg>, "auto_mark": bool, "lecture_id": int | null, "challenge": bool}
    The client sends one frame and waits for the reply before sending the next,
    so every frame MUST get exactly one reply (skipping one silently would stall the client).
    Head-turn challenges are tracked per connection, which is why this needs a live stream.
    """
    await websocket.accept()
    if SessionLocal is None:
        await websocket.send_text(json.dumps({"error": "Database is not configured.", "faces": []}))
        await websocket.close()
        return
    logger.info("WebSocket client connected for live attendance streaming.")
    session = LiveSession()

    # Rate limit: at most ~5 inferences per second per connection to conserve CPU
    last_process_time = 0.0
    min_interval = 0.18  # seconds

    try:
        while True:
            data_str = await websocket.receive_text()
            wait = min_interval - (time.time() - last_process_time)
            if wait > 0:
                await asyncio.sleep(wait)
            last_process_time = time.time()

            try:
                msg = json.loads(data_str)
                faces = []
                if msg.get("image"):
                    faces = await run_in_threadpool(_process_frame, session, msg)
                await websocket.send_text(json.dumps({"timestamp": time.time(), "faces": faces}))
            except WebSocketDisconnect:
                raise
            except Exception as e:
                logger.error(f"Error processing live frame: {e}")
                await websocket.send_text(json.dumps({"error": str(e), "faces": []}))

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected from live attendance.")
