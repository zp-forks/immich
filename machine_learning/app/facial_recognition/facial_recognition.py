import face_recognition


def detect_face(db_cursor):
    db_cursor.execute("select * from users")
    records = db_cursor.fetchall()

    print(records)
    print("detecting face")
