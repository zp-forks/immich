import os
import face_recognition
import uuid
from os import walk
from PIL import Image
import pickle
import numpy as np
from sklearn.cluster import DBSCAN
import cv2


def detect_face(assets, db_cur):

    facial_data = []

    for asset in assets:
        if asset['type'] == "IMAGE":
            image_path = asset['originalPath']
            if image_path[0] == '.':
                image_path = image_path[2:]

            imagePath = f'./app/{image_path}'

            if os.path.exists(imagePath):
                try:
                    image = cv2.imread(imagePath)
                    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                    boxes = face_recognition.face_locations(rgb)

                    if len(boxes) > 0:
                        encodings = face_recognition.face_encodings(
                            rgb, boxes)
                        d = [{"imagePath": imagePath, "loc": box, "encoding": enc}
                             for (box, enc) in zip(boxes, encodings)]

                        facial_data.extend(d)
                except:
                    print("Error reading file")

    print("[INFO] serializing encodings...")
    f = open("./app/upload/faces/encodings.pickle", "wb")
    f.write(pickle.dumps(facial_data))
    f.close()
    # for face_location in face_locations:

    #     top, right, bottom, left = face_location

    #     face_image = image[top:bottom, left:right]
    #     pil_image = Image.fromarray(face_image)
    #     pil_image.save(f"./app/upload/faces/{str(uuid.uuid4())}.jpg")


def cluster_face():
    encoding_facial_info = "./app/upload/faces/encodings.pickle"
    data = pickle.loads(open(encoding_facial_info, "rb").read())
    data = np.array(data)
    encodings = [d["encoding"] for d in data]

    print("[INFO] clustering...")

    clt = DBSCAN(metric="euclidean")
    clt.fit(encodings)
    # determine the total number of unique faces found in the dataset
    labelIDs = np.unique(clt.labels_)
    numUniqueFaces = len(np.where(labelIDs > -1)[0])

    print(f"[INFO] # unique faces: {numUniqueFaces}")

    for labelID in labelIDs:
        # find all indexes into the `data` array that belong to the
        # current label ID, then randomly sample a maximum of 25 indexes
        # from the set
        idxs = np.where(clt.labels_ == labelID)[0]
        idxs = np.random.choice(idxs, size=min(25, len(idxs)),
                                replace=False)
        # initialize the list of faces to include in the montage
        faces = []
        print("NUmber of distinc face: ", idxs)
        for i in idxs:
            # load the input image and extract the face ROI
            image = cv2.imread(data[i]["imagePath"])
            (top, right, bottom, left) = data[i]["loc"]
            face = image[top:bottom, left:right]

            # force resize the face ROI to 96x96 and then add it to the
            # faces montage list
            face = cv2.resize(face, (96, 96))
            cv2.imwrite(f"./app/upload/faces/{i}.jpg", face)
            faces.append(face)
