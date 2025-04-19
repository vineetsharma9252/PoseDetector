from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import cv2
import numpy as np
import mediapipe as mp
import threading
import math

app = Flask(__name__)
CORS(app)

# Initialize MediaPipe
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils
pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)

# Global variables
video_capture = None
is_streaming = False
frame_lock = threading.Lock()
current_frame = None
current_exercise = "squats"  # Default exercise
feedback = {}

# Custom drawing specs
CORRECT_SPEC = mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=2)
INCORRECT_SPEC = mp_drawing.DrawingSpec(color=(0, 0, 255), thickness=3, circle_radius=3)
CONNECTION_SPEC = mp_drawing.DrawingSpec(color=(245, 117, 66), thickness=2, circle_radius=1)

def calculate_angle(a, b, c):
    a = np.array(a)
    b = np.array(b)
    c = np.array(c)
    
    radians = np.arctan2(c[1]-b[1], c[0]-b[0]) - np.arctan2(a[1]-b[1], a[0]-b[0])
    angle = np.abs(radians * 180.0 / math.pi)
    
    if angle > 180.0:
        angle = 360 - angle
        
    return angle

def evaluate_squats(landmarks):
    feedback = {"issues": [], "correct": []}
    
    left_hip = [landmarks[mp_pose.PoseLandmark.LEFT_HIP.value].x, 
                landmarks[mp_pose.PoseLandmark.LEFT_HIP.value].y]
    left_knee = [landmarks[mp_pose.PoseLandmark.LEFT_KNEE.value].x, 
                 landmarks[mp_pose.PoseLandmark.LEFT_KNEE.value].y]
    left_ankle = [landmarks[mp_pose.PoseLandmark.LEFT_ANKLE.value].x, 
                  landmarks[mp_pose.PoseLandmark.LEFT_ANKLE.value].y]
    left_shoulder = [landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value].x, 
                     landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value].y]
    
    knee_angle = calculate_angle(left_hip, left_knee, left_ankle)
    torso_angle = calculate_angle(left_hip, left_shoulder, (left_shoulder[0], left_hip[1]))
    
    if knee_angle > 160:
        feedback["issues"].append("Knees not bent enough")
    elif knee_angle < 90:
        feedback["issues"].append("Knees bent too much")
    else:
        feedback["correct"].append("Knee bend")
    
    if torso_angle < 70:
        feedback["issues"].append("Back leaning too far forward")
    else:
        feedback["correct"].append("Back position")
    
    return feedback

def evaluate_pushups(landmarks):
    feedback = {"issues": [], "correct": []}
    
    left_shoulder = [landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value].x, 
                     landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value].y]
    left_elbow = [landmarks[mp_pose.PoseLandmark.LEFT_ELBOW.value].x, 
                  landmarks[mp_pose.PoseLandmark.LEFT_ELBOW.value].y]
    left_wrist = [landmarks[mp_pose.PoseLandmark.LEFT_WRIST.value].x, 
                  landmarks[mp_pose.PoseLandmark.LEFT_WRIST.value].y]
    left_hip = [landmarks[mp_pose.PoseLandmark.LEFT_HIP.value].x, 
                landmarks[mp_pose.PoseLandmark.LEFT_HIP.value].y]
    
    elbow_angle = calculate_angle(left_shoulder, left_elbow, left_wrist)
    torso_angle = calculate_angle(left_shoulder, left_hip, (left_hip[0], left_shoulder[1]))
    
    if elbow_angle > 120:
        feedback["issues"].append("Elbows too wide")
    elif elbow_angle < 60:
        feedback["issues"].append("Elbows too close")
    else:
        feedback["correct"].append("Elbow position")
    
    if torso_angle < 160:
        feedback["issues"].append("Back not straight")
    else:
        feedback["correct"].append("Back position")
    
    return feedback

def video_processing():
    global video_capture, is_streaming, current_frame, feedback
    
    video_capture = cv2.VideoCapture(0)
    while is_streaming:
        ret, frame = video_capture.read()
        if not ret:
            break
            
        image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image.flags.writeable = False
        results = pose.process(image)
        image.flags.writeable = True
        image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
        
        if results.pose_landmarks:
            landmarks = results.pose_landmarks.landmark
            
            if current_exercise == "squats":
                feedback = evaluate_squats(landmarks)
            else:
                feedback = evaluate_pushups(landmarks)
            
            for idx, landmark in enumerate(results.pose_landmarks.landmark):
                landmark_name = mp_pose.PoseLandmark(idx).name
                is_correct = (
    ("knee" in landmark_name.lower() and "Knee bend" in feedback["correct"]) or
    ("elbow" in landmark_name.lower() and "Elbow position" in feedback["correct"]) or
    ("shoulder" in landmark_name.lower() and "Back position" in feedback["correct"]) or
    ("hip" in landmark_name.lower() and "Back position" in feedback["correct"])
)
                spec = CORRECT_SPEC if is_correct else INCORRECT_SPEC
                cv2.circle(image, 
                          (int(landmark.x * image.shape[1]), 
                          int(landmark.y * image.shape[0])),
                          spec.circle_radius, 
                          spec.color, 
                          spec.thickness)
            
            mp_drawing.draw_landmarks(
                image, 
                results.pose_landmarks, 
                mp_pose.POSE_CONNECTIONS,
                connection_drawing_spec=CONNECTION_SPEC
            )
            
            if feedback["issues"]:
                text = "Issues: " + ", ".join(feedback["issues"])
                cv2.putText(image, text, (10, 30), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        
        with frame_lock:
            current_frame = image
    
    video_capture.release()

@app.route('/video_feed')
def video_feed():
    def generate_frames():
        global current_frame
        while True:
            with frame_lock:
                if current_frame is not None:
                    _, buffer = cv2.imencode('.jpg', current_frame)
                    frame = buffer.tobytes()
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/start_stream', methods=['POST'])
def start_stream():
    global is_streaming
    if not is_streaming:
        is_streaming = True
        threading.Thread(target=video_processing).start()
        return jsonify({'message': 'Stream started'})
    return jsonify({'message': 'Stream is already running'})

@app.route('/stop_stream', methods=['POST'])
def stop_stream():
    global is_streaming, video_capture
    is_streaming = False
    if video_capture and video_capture.isOpened():
        video_capture.release()
    return jsonify({'message': 'Stream stopped'})

@app.route('/set_exercise', methods=['POST'])
def set_exercise():
    global current_exercise
    data = request.get_json()
    current_exercise = data.get('exercise', 'squats')
    return jsonify({'message': f'Exercise set to {current_exercise}'})

@app.route('/get_feedback', methods=['GET'])
def get_feedback():
    return jsonify(feedback)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, threaded=True)
