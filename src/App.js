import { useState, useEffect } from 'react';
import './App.css';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Text } from '@react-three/drei';

function App() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [message, setMessage] = useState('Press "Start Stream" to begin');
  const [exercise, setExercise] = useState('squats');
  const [feedback, setFeedback] = useState({ issues: [], correct: [] });
  const [show3D, setShow3D] = useState(false);
  const [keypoints, setKeypoints] = useState([]);

  // Start/stop video stream
  const toggleStream = async () => {
    if (isStreaming) {
      try {
        await fetch('http://localhost:5000/stop_stream', { method: 'POST' });
        setIsStreaming(false);
        setIsDetecting(false);
        setMessage('Stream stopped');
      } catch (err) {
        console.error('Error stopping stream:', err);
      }
    } else {
      try {
        await fetch('http://localhost:5000/start_stream', { method: 'POST' });
        setIsStreaming(true);
        setMessage('Stream started - ready for detection');
      } catch (err) {
        console.error('Error starting stream:', err);
      }
    }
  };

  // Toggle pose detection
  const toggleDetection = () => {
    setIsDetecting(!isDetecting);
    setMessage(isDetecting ? 'Detection stopped' : `Detecting ${exercise}...`);
  };

  // Change exercise
  const changeExercise = (newExercise) => {
    setExercise(newExercise);
    fetch('http://localhost:5000/set_exercise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercise: newExercise })
    });
    setMessage(`Exercise changed to ${newExercise}`);
  };

  // Get feedback periodically
  useEffect(() => {
    let interval;
    if (isDetecting && isStreaming) {
      interval = setInterval(() => {
        fetch('http://localhost:5000/get_feedback')
          .then(res => res.json())
          .then(data => setFeedback(data))
          .catch(err => console.error('Feedback error:', err));
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isDetecting, isStreaming]);

  return (
    <div className="app">
      <h1>Exercise Posture Coach</h1>
      
      <div className="exercise-selector">
        <button
          className={exercise === 'squats' ? 'active' : ''}
          onClick={() => changeExercise('squats')}
        >
          Squats
        </button>
        <button
          className={exercise === 'pushups' ? 'active' : ''}
          onClick={() => changeExercise('pushups')}
        >
          Push-Ups
        </button>
      </div>
      
      <div className="video-container">
        <img 
          src={isStreaming ? "http://localhost:5000/video_feed" : ""}
          alt="Video Feed"
          className="video-feed"
        />
        
        {!isStreaming && (
          <div className="video-overlay">
            <p>Stream is offline</p>
          </div>
        )}
      </div>
      
      <div className="controls">
        <button 
          onClick={toggleStream}
          className={`control-btn ${isStreaming ? 'stop' : 'start'}`}
        >
          {isStreaming ? 'Stop Stream' : 'Start Stream'}
        </button>
        
        <button 
          onClick={toggleDetection}
          className={`control-btn ${isDetecting ? 'stop' : 'start'}`}
          disabled={!isStreaming}
        >
          {isDetecting ? 'Stop Detection' : 'Start Detection'}
        </button>
        
        <button 
          onClick={() => setShow3D(!show3D)}
          className="control-btn toggle-3d"
        >
          {show3D ? 'Hide 3D View' : 'Show 3D View'}
        </button>
      </div>
      
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
      
      {show3D && (
        <div className="three-container">
          <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} />
            
            {/* Example 3D feedback elements */}
            {feedback.issues.includes("Back leaning too far forward") && (
              <Text
                position={[0, 1.5, 0]}
                color="red"
                fontSize={0.3}
              >
                Keep your back more upright!
              </Text>
            )}
            
            {feedback.issues.includes("Knees not bent enough") && (
              <Text
                position={[0, -1, 0]}
                color="red"
                fontSize={0.3}
              >
                Bend your knees more!
              </Text>
            )}
            
            {/* Add more 3D feedback elements as needed */}
          </Canvas>
        </div>
      )}
      
      <div className="message-box">
        <p>{message}</p>
      </div>
    </div>
  );
}

export default App;