import { useState, useEffect, useRef } from "react";
import Webcam from "react-webcam";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";
import "./App.css";

// Pose connections for 33 landmarks (MediaPipe standard)
const POSE_CONNECTIONS = [
  [11, 12], // Shoulders
  [11, 13], // Left shoulder to elbow
  [13, 15], // Left elbow to wrist
  [12, 14], // Right shoulder to elbow
  [14, 16], // Right elbow to wrist
  [11, 23], // Left shoulder to hip
  [12, 24], // Right shoulder to hip
  [23, 24], // Hips
  [23, 25], // Left hip to knee
  [24, 26], // Right hip to knee
  [25, 27], // Left knee to ankle
  [26, 28], // Right knee to ankle
  [27, 29], // Left ankle to heel
  [28, 30], // Right ankle to heel
  [29, 31], // Left heel to toe
  [30, 32], // Right heel to toe
];

function App() {
  const [exercise, setExercise] = useState("squats");
  const [isStreaming, setIsStreaming] = useState(false);
  const [feedback, setFeedback] = useState({
    issues: [],
    correct: [],
    phase: "starting",
    problemPoints: [],
  });
  const [webcamError, setWebcamError] = useState(null);
  const [keypoints, setKeypoints] = useState([]);

  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const poseLandmarkerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const webcamRunningRef = useRef(false);

  useEffect(() => {
    const initializePoseLandmarker = async () => {
      try {
        console.log("Initializing Pose Landmarker...");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
        );
        console.log("Vision tasks resolved");

        let modelAssetPath =
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task";

        try {
          const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath,
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.4, // Lowered for sensitivity
            minPosePresenceConfidence: 0.4,
            minTrackingConfidence: 0.4,
          });
          poseLandmarkerRef.current = poseLandmarker;
          console.log("Pose Landmarker initialized with heavy model");
        } catch (error) {
          console.warn("Heavy model failed, falling back to full model:", error);
          modelAssetPath =
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";
          const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath,
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.4,
            minPosePresenceConfidence: 0.4,
            minTrackingConfidence: 0.4,
          });
          poseLandmarkerRef.current = poseLandmarker;
          console.log("Pose Landmarker initialized with full model");
        }
      } catch (error) {
        console.error("Error initializing Pose Landmarker:", error);
        setWebcamError("Failed to initialize pose detection. Please try reloading.");
      }
    };

    initializePoseLandmarker();

    return () => {
      console.log("Cleaning up Pose Landmarker...");
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      webcamRunningRef.current = false;
      if (poseLandmarkerRef.current) {
        poseLandmarkerRef.current.close();
      }
    };
  }, []);

  const toggleStream = async () => {
    if (isStreaming) {
      console.log("Stopping webcam stream...");
      webcamRunningRef.current = false;
      setIsStreaming(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    } else {
      console.log("Starting webcam stream...");
      try {
        const hasWebcam = await checkWebcamAvailability();
        if (!hasWebcam) return;

        setIsStreaming(true);
        webcamRunningRef.current = true;
        setWebcamError(null);
      } catch (err) {
        console.error("Error accessing webcam:", err);
        setWebcamError("Please allow camera access and reload the page");
      }
    }
  };

  const checkWebcamAvailability = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setWebcamError("Webcam access not supported by your browser");
      return false;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasCamera = devices.some((device) => device.kind === "videoinput");
      if (!hasCamera) {
        setWebcamError("No camera found on your device");
        return false;
      }
      console.log("Webcam available");
      return true;
    } catch (error) {
      console.error("Error checking webcam:", error);
      setWebcamError("Could not check camera availability");
      return false;
    }
  };

  const handleWebcamError = (error) => {
    console.error("Webcam error:", error);
    if (error.name === "NotAllowedError") {
      setWebcamError("Camera access denied. Please allow camera permissions.");
    } else if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      setWebcamError("No suitable camera found.");
    } else {
      setWebcamError("Could not access the camera: " + error.message);
    }
    webcamRunningRef.current = false;
    setIsStreaming(false);
  };

  const predictWebcam = () => {
    const video = webcamRef.current?.video;
    const canvas = canvasRef.current;

    if (!video || !canvas || !poseLandmarkerRef.current || !webcamRunningRef.current) {
      console.warn("Cannot predict: Missing video, canvas, or pose landmarker");
      return;
    }

    const canvasCtx = canvas.getContext("2d");
    const drawingUtils = new DrawingUtils(canvasCtx);
    const poseLandmarker = poseLandmarkerRef.current;

    if (video.readyState < video.HAVE_ENOUGH_DATA) {
      console.log("Video not ready, retrying...");
      animationFrameRef.current = requestAnimationFrame(predictWebcam);
      return;
    }

    if (lastVideoTimeRef.current !== video.currentTime) {
      lastVideoTimeRef.current = video.currentTime;
      const startTimeMs = performance.now();

      try {
        const results = poseLandmarker.detectForVideo(video, startTimeMs);
        console.log("Pose detection results:", results);

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          console.log("Detected landmarks:", landmarks);
          setKeypoints(landmarks);

          if (exercise) {
            const analysis = analyzePosture(landmarks, exercise);
            setFeedback(analysis);
            drawLandmarksWithFeedback(
              drawingUtils,
              landmarks,
              analysis.problemPoints,
              analysis.issues.length === 0
            );
          } else {
            drawingUtils.drawLandmarks(landmarks, {
              radius: (data) => DrawingUtils.lerp(data.from.z, -0.15, 0.1, 5, 1),
              color: "#00FF00",
            });
            drawingUtils.drawConnectors(landmarks, POSE_CONNECTIONS, {
              color: "#00FF00",
            });
          }
        } else {
          console.warn("No landmarks detected");
          setFeedback({
            issues: ["No person detected in the frame"],
            correct: [],
            phase: "starting",
            problemPoints: [],
          });
          setKeypoints([]);
        }

        canvasCtx.restore();
      } catch (error) {
        console.error("Error during pose detection:", error);
        setWebcamError("Error processing pose detection");
      }
    }

    if (webcamRunningRef.current) {
      animationFrameRef.current = requestAnimationFrame(predictWebcam);
    }
  };

  const drawLandmarksWithFeedback = (drawingUtils, landmarks, problemPoints, isCorrect) => {
    drawingUtils.drawLandmarks(landmarks, {
      radius: (data) => DrawingUtils.lerp(data.from.z, -0.15, 0.1, 5, 1),
      color: (data) => (problemPoints.includes(data.index) ? "#FF0000" : "#00FF00"),
    });

    POSE_CONNECTIONS.forEach(([start, end]) => {
      const isProblemConnection = problemPoints.includes(start) || problemPoints.includes(end);
      drawingUtils.drawConnectors(landmarks, [[start, end]], {
        color: isProblemConnection ? "#FF0000" : "#00FF00",
      });
    });
  };

  const analyzePosture = (landmarks, currentExercise) => {
    const analysis = {
      issues: [],
      correct: [],
      phase: "unknown",
      problemPoints: [],
    };

    if (landmarks.length < 33) {
      analysis.issues.push("Insufficient landmarks detected for analysis");
      return analysis;
    }

    if (currentExercise === "squats") {
      analyzeSquats(landmarks, analysis);
    } else if (currentExercise === "pushups") {
      analyzePushups(landmarks, analysis);
    }

    return analysis;
  };

  const analyzeSquats = (landmarks, analysis) => {
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    const backAngle = calculateAngle(leftShoulder, leftHip, leftKnee);
    const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    const leftKneeTooForward = Math.abs(leftKnee.x - leftAnkle.x) > 0.15;
    const rightKneeTooForward = Math.abs(rightKnee.x - rightAnkle.x) > 0.15;

    if (leftKneeAngle < 110 && rightKneeAngle < 110) {
      analysis.phase = "descent";
    } else {
      analysis.phase = "ascent";
    }

    if (backAngle > 45) {
      analysis.issues.push("Back too far forward. Keep it more upright.");
      analysis.problemPoints.push(11, 12, 23, 24);
    }

    if (leftKneeAngle < 80 || rightKneeAngle < 80) {
      analysis.issues.push("Knees not bent enough. Lower your squat.");
      analysis.problemPoints.push(25, 26);
    }

    if (leftKneeTooForward || rightKneeTooForward) {
      analysis.issues.push("Knees too far forward. Keep them over your ankles.");
      analysis.problemPoints.push(25, 26);
    }

    if (analysis.issues.length === 0) {
      analysis.correct.push("Great squat form! Keep it up!");
    }
  };

  const analyzePushups = (landmarks, analysis) => {
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftElbow = landmarks[13];
    const rightElbow = landmarks[14];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftHip = landmarks[23];
    const leftKnee = landmarks[25];

    const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
    const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
    const torsoAngle = calculateAngle(leftShoulder, leftHip, leftKnee);

    if (leftElbowAngle < 100 || rightElbowAngle < 100) {
      analysis.phase = "descent";
    } else {
      analysis.phase = "ascent";
    }

    if (torsoAngle > 15) {
      analysis.issues.push("Back is sagging. Keep your body straight.");
      analysis.problemPoints.push(11, 12, 23, 24);
    }

    if (leftElbowAngle > 100 && rightElbowAngle > 100 && analysis.phase === "descent") {
      analysis.issues.push("Chest not lowered enough. Go lower.");
      analysis.problemPoints.push(11, 12, 13, 14);
    }

    if (Math.abs(leftElbow.x - leftShoulder.x) > 0.2 || Math.abs(rightElbow.x - rightShoulder.x) > 0.2) {
      analysis.issues.push("Elbows flaring out. Keep them closer to body.");
      analysis.problemPoints.push(13, 14);
    }

    if (analysis.issues.length === 0) {
      analysis.correct.push("Excellent push-up form!");
    }
  };

  const calculateAngle = (A, B, C) => {
    const AB = { x: A.x - B.x, y: A.y - B.y };
    const BC = { x: C.x - B.x, y: C.y - B.y };

    const dotProduct = AB.x * BC.x + AB.y * BC.y;
    const magAB = Math.sqrt(AB.x ** 2 + AB.y ** 2);
    const magBC = Math.sqrt(BC.x ** 2 + BC.y ** 2);

    if (magAB === 0 || magBC === 0) return 0;

    const cosTheta = Math.min(Math.max(dotProduct / (magAB * magBC), -1), 1);
    return (Math.acos(cosTheta) * 180) / Math.PI;
  };

  const startExercise = (exerciseType) => {
    console.log("Starting exercise:", exerciseType);
    setExercise(exerciseType);
    setFeedback({
      issues: [],
      correct: [],
      phase: "starting",
      problemPoints: [],
    });
  };

  const videoConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: "user",
  };

  return (
    <div className="app">
      <h1 className="title">Exercise Posture Coach</h1>

      {webcamError && <div className="error-message">{webcamError}</div>}

      <div className="video-container">
        {isStreaming ? (
          <div className="video-feed-container" style={{ position: "relative" }}>
            <Webcam
              audio={false}
              ref={webcamRef}
              videoConstraints={videoConstraints}
              onUserMedia={() => {
                console.log("Webcam ready");
                if (webcamRunningRef.current) predictWebcam();
              }}
              onUserMediaError={handleWebcamError}
              className="video-feed"
              style={{ transform: "scaleX(-1)" }}
            />
            <canvas
              ref={canvasRef}
              className="pose-canvas"
              width={videoConstraints.width.ideal}
              height={videoConstraints.height.ideal}
              style={{ transform: "scaleX(-1)", position: "absolute", top: 0, left: 0, zIndex: 10 }}
            />
          </div>
        ) : (
          <div className="video-overlay">
            <p>Webcam is offline</p>
          </div>
        )}
      </div>

      <div className="controls">
        <button
          onClick={toggleStream}
          className={`control-btn ${isStreaming ? "stop" : "start"}`}
        >
          {isStreaming ? "Stop Webcam" : "Start Webcam"}
        </button>

        {isStreaming && (
          <>
            <button
              onClick={() => startExercise("squats")}
              className={`exercise-btn ${exercise === "squats" ? "active" : ""}`}
            >
              Start Squats
            </button>
            <button
              onClick={() => startExercise("pushups")}
              className={`exercise-btn ${exercise === "pushups" ? "active" : ""}`}
            >
              Start Push-Ups
            </button>
          </>
        )}
      </div>

      {exercise && (
        <div className="feedback-panel">
          <h2>
            {exercise === "squats" ? "Squats" : "Push-Ups"} Feedback - {feedback.phase}
          </h2>

          {feedback.issues.length > 0 && (
            <div className="feedback-section issues">
              <h3>⚠️ Issues Detected</h3>
              <ul>
                {feedback.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {feedback.correct.length > 0 && (
            <div className="feedback-section correct">
              <h3>✓ Correct Form</h3>
              <ul>
                {feedback.correct.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="threejs-container">
        <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          {keypoints.length > 0 && (
            <group>
              {keypoints.map((point, index) => {
                const isProblemPoint = feedback.problemPoints.includes(index);
                return (
                  <mesh
                    key={`point-${index}`}
                    position={[(point.x - 0.5) * 4, -(point.y - 0.5) * 4, point.z * 4]}
                  >
                    <sphereGeometry args={[0.05, 16, 16]} />
                    <meshStandardMaterial color={isProblemPoint ? "#ff0000" : "#00ff00"} />
                  </mesh>
                );
              })}

              {POSE_CONNECTIONS.map(([startIdx, endIdx], connectionIdx) => {
                if (!keypoints[startIdx] || !keypoints[endIdx]) return null;

                const start = keypoints[startIdx];
                const end = keypoints[endIdx];
                const isProblemConnection =
                  feedback.problemPoints.includes(startIdx) || feedback.problemPoints.includes(endIdx);

                const points = [
                  new THREE.Vector3((start.x - 0.5) * 4, -(start.y - 0.5) * 4, start.z * 4),
                  new THREE.Vector3((end.x - 0.5) * 4, -(end.y - 0.5) * 4, end.z * 4),
                ];

                const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);

                return (
                  <line key={`connection-${connectionIdx}`} geometry={lineGeometry}>
                    <lineBasicMaterial
                      color={isProblemConnection ? "#ff0000" : "#00ff00"}
                      linewidth={2}
                    />
                  </line>
                );
              })}
            </group>
          )}
        </Canvas>
      </div>
    </div>
  );
}

export default App;