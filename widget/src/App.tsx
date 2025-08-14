import React from 'react';
import WebChatWidget from './components/WebChatWidget';
import './App.css';
import AdminPanel from './components/AdminPanel';

function App() {
  return (
    <div className="App">
      <AdminPanel />
      <WebChatWidget />
    </div>
  );
}

export default App;