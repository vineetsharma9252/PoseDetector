import { useState, useEffect } from "react";
import "./App.css";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Text } from "@react-three/drei";

function App() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [message, setMessage] = useState('Press "Start Stream" to begin');
  const [exercise, setExercise] = useState("squats");
  const [feedback, setFeedback] = useState({ issues: [], correct: [] });
  const [feedbackCon, setFeedbackCon] = useState(false);
  const [keypoints, setKeypoints] = useState([]);

  const [videoFeed, setVideoFeed] = useState(null);

  const showFeedback = isDetecting && isStreaming;

  // Start/stop video stream
  const toggleStream = async () => {
    if (isStreaming) {
      try {
        await fetch("http://localhost:5000/stop_stream", { method: "POST" });
        setIsStreaming(false);
        setIsDetecting(false);
        setMessage("Stream stopped");

        setFeedbackCon(true);
      } catch (err) {
        console.error("Error stopping stream:", err);
      }
    } else {
      try {
        await fetch("http://localhost:5000/start_stream", { method: "POST" });
        setFeedbackCon(false);
        setIsStreaming(true);
        setMessage("Stream started - ready for detection");
      } catch (err) {
        console.error("Error starting stream:", err);
      }
    }
  };

  // Toggle pose detection
  const toggleDetection = () => {
    setIsDetecting(!isDetecting);
    setMessage(isDetecting ? "Detection stopped" : `Detecting ${exercise}...`);
  };

  // Change exercise
  const changeExercise = (newExercise) => {
    setExercise(newExercise);
    fetch("http://localhost:5000/set_exercise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exercise: newExercise }),
    });

    alert("Exercise changed to " + newExercise);

    setMessage(`Exercise changed to ${newExercise}`);
  };

  // Get feedback periodically
  useEffect(() => {
    let interval;
    if (isDetecting && isStreaming) {
      interval = setInterval(() => {
        fetch("http://localhost:5000/get_feedback")
          .then((res) => res.json())
          .then((data) => setFeedback(data))
          .catch((err) => console.error("Feedback error:", err));
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isDetecting, isStreaming]);

  return (
    <div className="app">
      <h1 align="center">Exercise Posture Coach</h1>

      <div className="exercise-selector">
        <button
          className={exercise === "squats" ? "active" : ""}
          onClick={() => changeExercise("squats")}
        >
          Squats
        </button>
        <button
          className={exercise === "pushups" ? "active" : ""}
          onClick={() => changeExercise("pushups")}
        >
          Push-Ups
        </button>
      </div>

      <div
        className="video-container"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {isStreaming && <div
          className="video-feed-container"
          style={{
            border: "5px solid black",
            borderRadius: "20px",
            overflow: "hidden",
          }}
        >
          <img
            src={isStreaming ? "http://localhost:5000/video_feed" : ""}
            className="video-feed"
            style={{
              width: "840px",
            }}
          />
        </div>
}
        <br />
        {!isStreaming && (
          <div className="video-overlay" style={{ position: "absolute" }}>
            <p>Stream is offline</p>
          </div>
        )}
      </div>

      <div
        className="controls"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          marginTop: "20px",
        }}
      >
        <button
          onClick={toggleStream}
          className={`control-btn ${isStreaming ? "stop" : "start"}`}
          style={{
            color: "white",
            backgroundColor: "grey",
            borderRadius: "5px",
            height: "40px",
            width: "150px",
          }}
        >
          {isStreaming ? "Stop Stream" : "Start Stream"}
        </button>

        <button
          onClick={toggleDetection}
          className={`control-btn ${isDetecting ? "stop" : "start"}`}
          disabled={!isStreaming}
          style={{
            color: "white",
            backgroundColor: "green",
            borderRadius: "5px",
            height: "40px",
            width: "150px",
            marginLeft: "10px",
          }}
        >
          {isDetecting ? "Stop Detection" : "Start Detection"}
        </button>
      </div>

      {showFeedback && (
        <div className="feedback-panel">
          <h2>Posture Feedback</h2>

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

          {feedback.issues.length === 0 && feedback.correct.length === 0 && (
            <p>No posture feedback available yet</p>
          )}
        </div>
      )}

      <div className="message-box">
        <p>{message}</p>
      </div>
    </div>
  );
}

export default App;
