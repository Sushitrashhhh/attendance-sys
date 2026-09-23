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

from app.db.database import get_db, SessionLocal
from app.services.recognition_service import get_recognition_service
from app.schemas.recognition import RecognitionResult
from app.cv.preprocessing import decode_image_bytes, decode_base64_image

logger = logging.getLogger("attendance.api.recognition")
router = APIRouter(prefix="/api/recognition", tags=["Recognition"])


class RecognitionRequestPayload(BaseModel):
    image_base64: str
    auto_mark: bool = True


@router.post("/test", response_model=RecognitionResult)
async def test_recognition(
    image: Optional[UploadFile] = File(None),
    image_base64: Optional[str] = Form(None),
    auto_mark: bool = Form(True),
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
        content = await image.read()
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
    result = service.recognize_single_image(db, img_bgr, auto_mark=auto_mark)
    return result


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
    return service.recognize_single_image(db, img_bgr, auto_mark=payload.auto_mark)


@router.websocket("/ws")
async def websocket_recognition(websocket: WebSocket):
    """
    Real-time bidirectional WebSocket stream for live webcam attendance:
    - Client streams downsampled video frames (base64 JPEG)
    - Backend processes frames, manages temporal throttle, and streams back
      bounding boxes, identity, liveness score, and attendance status.
    """
    await websocket.accept()
    logger.info("WebSocket client connected for live attendance streaming.")
    service = get_recognition_service()

    # Rate limiting: max ~5 inferences per second per connection to conserve CPU
    last_process_time = 0.0
    min_interval = 0.18  # seconds

    try:
        while True:
            data_str = await websocket.receive_text()
            now = time.time()
            if now - last_process_time < min_interval:
                # Frame skipped to throttle processing smoothly
                continue

            last_process_time = now

            try:
                msg = json.loads(data_str)
                frame_b64 = msg.get("image", "")
                auto_mark = msg.get("auto_mark", True)

                if not frame_b64:
                    continue

                img_bgr = decode_base64_image(frame_b64)

                # Open fresh DB session for the frame
                db = SessionLocal()
                try:
                    results = service.recognize_frame(
                        db, img_bgr, auto_mark=auto_mark, max_faces=4
                    )
                finally:
                    db.close()

                response_payload = {
                    "timestamp": time.time(),
                    "faces": [r.model_dump() for r in results],
                }
                await websocket.send_text(json.dumps(response_payload))

            except Exception as e:
                logger.error(f"Error processing live frame: {e}")
                await websocket.send_text(
                    json.dumps({"error": str(e), "faces": []})
                )

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected from live attendance.")
