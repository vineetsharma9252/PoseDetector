import { useState, useEffect, useRef } from "react";
import Webcam from "react-webcam";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";
import "./App.css";

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
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        poseLandmarkerRef.current = poseLandmarker;
      } catch (error) {
        console.error("Error initializing Pose Landmarker:", error);
        setWebcamError("Failed to initialize pose detection");
      }
    };

    initializePoseLandmarker();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      webcamRunningRef.current = false;
    };
  }, []);


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
      return true;
    } catch (error) {
      setWebcamError("Could not check camera availability");
      return false;
    }
  };


  const toggleStream = async () => {
    if (isStreaming) {
      webcamRunningRef.current = false;
    
      window.location.reload();
      setIsStreaming(false);
      setExercise(null);
      setWebcamError(null);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    } else {
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

  
  const handleWebcamError = (error) => {
    if (error.name === "NotAllowedError") {
      setWebcamError("Camera access denied. Please allow camera permissions.");
    } else if (
      error.name === "NotFoundError" ||
      error.name === "OverconstrainedError"
    ) {
      setWebcamError("No suitable camera found.");
    } else {
      setWebcamError("Could not access the camera: " + error.message);
    }
    webcamRunningRef.current = false;
    setIsStreaming(false);
  };

  
  const handleWebcamReady = () => {
    const video = webcamRef.current?.video;
    if (video && webcamRunningRef.current) {
      predictWebcam();
    }
  };

  
  const predictWebcam = () => {
    const video = webcamRef.current?.video;
    const canvas = canvasRef.current;

    if (
      !video ||
      !canvas ||
      !poseLandmarkerRef.current ||
      !webcamRunningRef.current
    ) {
      return;
    }

    const canvasCtx = canvas.getContext("2d");
    const drawingUtils = new DrawingUtils(canvasCtx);
    const poseLandmarker = poseLandmarkerRef.current;

    if (video.readyState < video.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(predictWebcam);
      return;
    }

    if (lastVideoTimeRef.current !== video.currentTime) {
      lastVideoTimeRef.current = video.currentTime;
      const startTimeMs = performance.now();

      try {
        const results = poseLandmarker.detectForVideo(video, startTimeMs);

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          setKeypoints(landmarks);
          if (exercise) {
            const analysis = analyzePosture(landmarks, exercise);
            console.log("Posture analysis results:", analysis);
            setFeedback(analysis);

            drawLandmarksWithFeedback(
              drawingUtils,
              landmarks,
              analysis.problemPoints,
              analysis.issues.length === 0
            );
          } else {
            drawingUtils.drawLandmarks(landmarks, {
              radius: (data) =>
                DrawingUtils.lerp(data.from.z, -0.15, 0.1, 5, 1),
              color: "#00FF00",
            });
            drawingUtils.drawConnectors(
              landmarks,
              PoseLandmarker.POSE_CONNECTIONS,
              {
                color: "#00FF00",
              }
            );
          }
        }

        canvasCtx.restore();
      } catch (error) {
        console.error("Error during detection:", error);
      }
    }

    if (webcamRunningRef.current) {
      animationFrameRef.current = requestAnimationFrame(predictWebcam);
    }
  };

  
  const drawLandmarksWithFeedback = (
    drawingUtils,
    landmarks,
    problemPoints,
    isCorrect
  ) => {
    if (isCorrect) {
      
      drawingUtils.drawLandmarks(landmarks, {
        radius: (data) => DrawingUtils.lerp(data.from.z, -0.15, 0.1, 5, 1),
        color: "#00FF00",
      });
      drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
        color: "#00FF00",
      });
    } else {
      
      drawingUtils.drawLandmarks(landmarks, {
        radius: (data) => DrawingUtils.lerp(data.from.z, -0.15, 0.1, 5, 1),
        color: "#00FF00",
      });
      
      problemPoints.forEach((pointIndex) => {
        if (landmarks[pointIndex]) {
          drawingUtils.drawLandmarks([landmarks[pointIndex]], {
            radius: 8,
            color: "#FF0000",
          });
        }
      });

      
      PoseLandmarker.POSE_CONNECTIONS.forEach(([start, end]) => {
        const isProblemConnection =
          problemPoints.includes(start) || problemPoints.includes(end);
        drawingUtils.drawConnectors(landmarks, [[start, end]], {
          color: isProblemConnection ? "#FF0000" : "#00FF00",
        });
      });
    }
  };

  
  const analyzePosture = (landmarks, currentExercise) => {
    const analysis = {
      issues: [],
      correct: [],
      phase: "unknown",
      problemPoints: [],
    };
    console.log(analyzePosture);
    console.log("Current exercise:", currentExercise);
    if (currentExercise === "squats") {
      analyzeSquats(landmarks, analysis);
      console.log("ANalysis is : ", analysis);
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

    console.log("Squats analysis landmarks:", landmarks);

    const backAngle = calculateAngle(leftShoulder, leftHip, leftKnee);
    const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    console.log(backAngle);
    // Check if knees are too far forward (approximated by x-coordinate difference)
    const leftKneeTooForward = leftKnee.x - leftAnkle.x > 0.1; // Knee significantly ahead of ankle
    const rightKneeTooForward = rightKnee.x - rightAnkle.x > 0.1;

    if (leftKneeAngle < 120 || rightKneeAngle < 120) {
      analysis.phase = "descent";
    } else {
      analysis.phase = "ascent";
    }

    // Feedback checks
    if (backAngle > 30) {
      analysis.issues.push("Back too far forward. Keep it more upright.");
      analysis.problemPoints.push(23, 24, 11, 12); // Hips and shoulders
    }

    if (leftKneeAngle < 90 || rightKneeAngle < 90) {
      analysis.issues.push("Knees not bent enough. Lower your squat.");
      analysis.problemPoints.push(25, 26); // Knees
    }

    if (leftKneeTooForward || rightKneeTooForward) {
      analysis.issues.push("Knees too far forward. Keep them over your toes.");
      analysis.problemPoints.push(25, 26); // Knees
    }

    if (analysis.issues.length === 0) {
      analysis.correct.push("Great squat form! Keep it up!");
    }
    return analysis;
  };

  // Pushups analysis
  const analyzePushups = (landmarks, analysis) => {
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftElbow = landmarks[13];
    const rightElbow = landmarks[14];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];

    const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
    const rightElbowAngle = calculateAngle(
      rightShoulder,
      rightElbow,
      rightWrist
    );
    const torsoAngle = calculateAngle(leftShoulder, leftHip, leftKnee);

    // Check if chest is lowered enough (approximated by elbow angle < 90° in descent)
    const chestNotLowered = leftElbowAngle > 90 || rightElbowAngle > 90;

    if (leftElbowAngle < 120 || rightElbowAngle < 120) {
      analysis.phase = "descent";
    } else {
      analysis.phase = "ascent";
    }

    // Feedback checks
    if (torsoAngle > 10) {
      analysis.issues.push("Back is sagging. Keep your body straight.");
      analysis.problemPoints.push(23, 24, 11, 12); // Hips and shoulders
    }

    if (chestNotLowered && analysis.phase === "descent") {
      analysis.issues.push("Chest not lowered enough. Go lower.");
      analysis.problemPoints.push(11, 12, 13, 14); // Shoulders and elbows
    }

    if (leftElbowAngle > 90 || rightElbowAngle > 90) {
      analysis.issues.push("Improper elbow angle. Keep elbows closer to body.");
      analysis.problemPoints.push(13, 14); // Elbows
    }

    if (analysis.issues.length === 0) {
      analysis.correct.push("Excellent push-up form!");
    }
  };

  // Helper function to calculate angle between three points
  // Calculate angle between three points (A-B-C)
  const calculateAngle = (A, B, C) => {
    const AB = { x: A.x - B.x, y: A.y - B.y };
    const CB = { x: C.x - B.x, y: C.y - B.y };

    const dotProduct = AB.x * CB.x + AB.y * CB.y;
    const magAB = Math.sqrt(AB.x ** 2 + AB.y ** 2);
    const magCB = Math.sqrt(CB.x ** 2 + CB.y ** 2);

    const angleRad = Math.acos(dotProduct / (magAB * magCB));
    return (angleRad * 180) / Math.PI;
  };

  // Start exercise detection
  const startExercise = (exerciseType) => {
    console.log("Starting exercise:", exerciseType);
    setExercise(exerciseType);
    setFeedback({
      issues: [],
      correct: [],
      phase: "starting",
      problemPoints: [],
    });
    console.log(feedback);
  };

  // Webcam constraints
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
          <div className="video-feed-container">
            <Webcam
              audio={false}
              ref={webcamRef}
              videoConstraints={videoConstraints}
              onUserMedia={handleWebcamReady}
              onUserMediaError={handleWebcamError}
              className="video-feed"
              style={{ transform: "scaleX(-1)" }}
            />
            <canvas
              ref={canvasRef}
              className="pose-canvas"
              width={videoConstraints.width.ideal}
              height={videoConstraints.height.ideal}
              style={{ transform: "scaleX(-1)" }}
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
              onClick={() => {
                startExercise("squats");
                setExercise("squats");
              }}
              className={`exercise-btn ${
                exercise === "squats" ? "active" : ""
              }`}
            >
              Start Squats
            </button>
            <button
              onClick={() => {
                startExercise("pushups");
                setExercise("pushups");
              }}
              className={`exercise-btn ${
                exercise === "pushups" ? "active" : ""
              }`}
            >
              Start Push-Ups
            </button>
          </>
        )}
      </div>

      {exercise && (
        <div className="feedback-panel">
          <h2>
            {exercise === "squats" ? "Squats" : "Push-Ups"} Feedback -{" "}
            {feedback.phase}
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
                const isProblemPoint = feedback.problemPoints?.includes(index);
                return (
                  <mesh
                    key={index}
                    position={[
                      point.x * 10 - 5,
                      -point.y * 10 + 5,
                      point.z * 10,
                    ]}
                  >
                    <sphereGeometry args={[0.1, 16, 16]} />
                    <meshStandardMaterial
                      color={isProblemPoint ? "#ff0000" : "#00ff00"}
                    />
                    {isProblemPoint && (
                      <Text
                        position={[0, 0.2, 0]}
                        fontSize={0.1}
                        color="red"
                        anchorX="center"
                        anchorY="middle"
                      >
                        {getLandmarkName(index)}
                      </Text>
                    )}
                  </mesh>
                );
              })}
            </group>
          )}
        </Canvas>
      </div>
    </div>
  );
}

// Helper function to get landmark names
const getLandmarkName = (index) => {
  const landmarkNames = [
    "Nose",
    "Left Eye",
    "Right Eye",
    "Left Ear",
    "Right Ear",
    "Left Shoulder",
    "Right Shoulder",
    "Left Elbow",
    "Right Elbow",
    "Left Wrist",
    "Right Wrist",
    "Left Hip",
    "Right Hip",
    "Left Knee",
    "Right Knee",
    "Left Ankle",
    "Right Ankle",
  ];
  return landmarkNames[index] || `Point ${index}`;
};

export default App;
