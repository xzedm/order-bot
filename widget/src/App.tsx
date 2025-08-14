import React from 'react';
import WebChatWidget from './components/WebChatWidget';
import './App.css';

function App() {
  return (
    <div className="App">
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-800 mb-8">
            Kerneu Group - Demo Page
          </h1>
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">About Our Products</h2>
            <p className="text-gray-600 mb-4">
              We offer a wide range of electronic components including Arduino boards, 
              Raspberry Pi, sensors, and development tools.
            </p>
            <p className="text-gray-600">
              Try our chat widget in the bottom-right corner to place an order or ask questions!
            </p>
          </div>
        </div>
      </div>
      <WebChatWidget />
    </div>
  );
}

export default App;