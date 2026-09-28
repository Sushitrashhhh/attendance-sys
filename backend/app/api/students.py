import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.database import get_db
from app.repositories.student_repo import StudentRepository
from app.schemas.student import StudentRead, StudentListResponse, StudentUpdate
from app.cv.pipeline import get_pipeline
from app.cv.preprocessing import decode_image_bytes, decode_base64_image

logger = logging.getLogger("attendance.api.students")
router = APIRouter(prefix="/api/students", tags=["Students"])


@router.post("", response_model=StudentRead, status_code=status.HTTP_201_CREATED)
def register_student(
    name: str = Form(..., min_length=2, max_length=120),
    roll_number: str = Form(..., min_length=1, max_length=50),
    branch: str = Form(..., min_length=2, max_length=100),
    semester: int = Form(..., ge=1, le=12),
    image: Optional[UploadFile] = File(None),
    image_base64: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """
    Register a new student with biometric facial enrollment:
    1. Verify unique roll number.
    2. Decode face image from upload or base64 webcam capture.
    3. Run face detection, alignment, quality check, and ArcFace 512-D embedding.
    4. Store student in Neon PostgreSQL with pgvector embedding.
    5. Return StudentRead (biometric embedding is strictly omitted).
    """
    student_repo = StudentRepository(db)

    # 1. Check duplicate roll number
    existing = student_repo.get_by_roll_number(roll_number)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Student with roll number '{roll_number}' already exists.",
        )

    # 2. Decode image
    img_bgr = None
    if image is not None:
        content = image.file.read()
        if len(content) > 10 * 1024 * 1024:  # 10MB limit
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Image file too large (max 10MB).",
            )
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
                detail=f"Invalid base64 image data: {str(e)}",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A facial enrollment image must be provided (file upload or image_base64).",
        )

    # 3. Biometric enrollment pipeline
    pipeline = get_pipeline()
    enrollment = pipeline.process_enrollment_image(img_bgr)
    if not enrollment.success or enrollment.embedding is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Facial enrollment rejected: {enrollment.message}",
        )

    # 4. Refuse to enroll the same face twice under different roll numbers
    nearest = student_repo.find_nearest(enrollment.embedding)
    if nearest and nearest[1] >= get_settings().recognition_threshold:
        match, _ = nearest
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This face is already registered to {match.name} ({match.roll_number}).",
        )

    # 5. Save in PostgreSQL
    try:
        new_student = student_repo.create(
            name=name,
            roll_number=roll_number,
            branch=branch,
            semester=semester,
            embedding=enrollment.embedding,
        )
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Student with roll number '{roll_number}' already exists.",
        )

    logger.info(f"Student enrolled: id={new_student.id}, roll={new_student.roll_number}")
    return new_student


@router.get("", response_model=StudentListResponse)
def list_students(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """List all registered students with pagination and search."""
    student_repo = StudentRepository(db)
    items, total = student_repo.list_students(skip=skip, limit=limit, search=search)
    return StudentListResponse(total=total, items=items)


@router.get("/{student_id}", response_model=StudentRead)
def get_student(student_id: int, db: Session = Depends(get_db)):
    """Fetch details for a single student."""
    student_repo = StudentRepository(db)
    student = student_repo.get_by_id(student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with ID {student_id} not found.",
        )
    return student


@router.put("/{student_id}", response_model=StudentRead)
def update_student(student_id: int, payload: StudentUpdate, db: Session = Depends(get_db)):
    """Edit a student's details. The face enrollment is left untouched."""
    student_repo = StudentRepository(db)
    student = student_repo.get_by_id(student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with ID {student_id} not found.",
        )
    if payload.roll_number:
        clash = student_repo.get_by_roll_number(payload.roll_number)
        if clash and clash.id != student_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Roll number '{payload.roll_number}' is already taken by {clash.name}.",
            )
    try:
        return student_repo.update(student, **payload.model_dump())
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Roll number '{payload.roll_number}' is already taken.",
        )


@router.delete("/{student_id}/face-samples")
def forget_learned_faces(student_id: int, db: Session = Depends(get_db)):
    """Drop face references learned from live check-ins; the enrollment photo is kept."""
    student_repo = StudentRepository(db)
    if not student_repo.get_by_id(student_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with ID {student_id} not found.",
        )
    return {"removed": student_repo.clear_face_samples(student_id)}


@router.delete("/{student_id}")
def delete_student(student_id: int, db: Session = Depends(get_db)):
    """Delete a student and permanently purge biometric data and attendance history."""
    student_repo = StudentRepository(db)
    success = student_repo.delete(student_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with ID {student_id} not found.",
        )
    return {"success": True, "message": f"Student {student_id} deleted successfully."}
