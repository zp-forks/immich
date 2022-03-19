import os
from pydantic import BaseModel
from fastapi import BackgroundTasks, FastAPI
from fastapi.concurrency import run_in_threadpool

from .object_detection import object_detection
from .image_classifier import image_classifier
from .facial_recognition import facial_recognition

from tf2_yolov4.anchors import YOLOV4_ANCHORS
from tf2_yolov4.model import YOLOv4

import psycopg2
import psycopg2.extras

HEIGHT, WIDTH = (640, 960)

# Warm up model
image_classifier.warm_up()

# Initialize database connection
DB_USERNAME = os.getenv('DB_USERNAME')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_DATABASE_NAME = os.getenv('DB_DATABASE_NAME')
db_conn = psycopg2.connect(
    f"host=immich_postgres port=5432 dbname={DB_DATABASE_NAME} user={DB_USERNAME} password={DB_PASSWORD}")


app = FastAPI()


class TagImagePayload(BaseModel):
    thumbnail_path: str


@app.post("/tagImage")
async def post_root(payload: TagImagePayload):
    image_path = payload.thumbnail_path

    if image_path[0] == '.':
        image_path = image_path[2:]

    return image_classifier.classify_image(image_path=image_path)


@app.get("/facialRecognition")
async def detect_face():

    db_cur = db_conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    db_cur.execute("""
        select *
        from assets
        where "isFaceDetected" = false
    """)

    assets = db_cur.fetchall()

    await run_in_threadpool(lambda: facial_recognition.detect_face(assets, db_cur))

    return {"message": "Running Facial Detection In The Background"}


@app.get("/facialCluster")
async def cluster_facial_info():
    await run_in_threadpool(lambda: facial_recognition.cluster_face())

    return {"message": "Running Facial Clustering In The Background"}
