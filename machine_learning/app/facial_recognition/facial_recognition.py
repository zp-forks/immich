import os
import face_recognition
from PIL import Image
import uuid


def detect_face(assets, db_cur):
    for asset in assets:
        image_path = asset['resizePath']
        if image_path[0] == '.':
            image_path = image_path[2:]

        formatted_image_path = f'./app/{image_path}'

        if os.path.exists(formatted_image_path):
            image = face_recognition.load_image_file(formatted_image_path)
            face_locations = face_recognition.face_locations(image)

            for face_location in face_locations:

                top, right, bottom, left = face_location

                face_image = image[top:bottom, left:right]
                pil_image = Image.fromarray(face_image)
                pil_image.save(f"./app/upload/faces/{str(uuid.uuid4())}.jpg")
