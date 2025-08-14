import React, { useState, useEffect, useRef } from 'react';
import { Send, X, MessageCircle, CheckCircle, AlertCircle } from 'lucide-react';

interface Product {
  name: string;
  price: number;
  sku: string;
  url?: string;
}

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  timestamp: string;
  orderId?: string;
  products?: Product[];
  isError?: boolean;
}

interface ApiResponse {
  reply?: string;
  orderId?: string;
  products?: Product[];
  message?: string;
}

const WebChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sid = `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(sid);

    if (isOpen && messages.length === 0) {
      setMessages([{
        id: 1,
        text: "Привет! Я помощник StemShop. Помогу оформить заказ или ответить на вопросы о товарах. Что вас интересует?",
        sender: 'bot',
        timestamp: new Date().toISOString()
      }]);
    }
  }, [isOpen, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || !sessionId) return;

    const userMessage: Message = {
      id: Date.now(),
      text: text.trim(),
      sender: 'user',
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text.trim(),
          sessionId: sessionId,
          channel: 'web'
        })
      });

      const data: ApiResponse = await response.json();

      if (response.ok) {
        const botMessage: Message = {
          id: Date.now() + 1,
          text: data.reply || 'Извините, произошла ошибка. Попробуйте ещё раз.',
          sender: 'bot',
          timestamp: new Date().toISOString(),
          orderId: data.orderId,
          products: data.products
        };

        setMessages(prev => [...prev, botMessage]);
      } else {
        throw new Error(data.message || 'Network error');
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: Date.now() + 1,
        text: 'Извините, сейчас я не могу ответить. Попробуйте позже или свяжитесь с менеджером.',
        sender: 'bot',
        timestamp: new Date().toISOString(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const ProductCard = ({ product }: { product: Product }) => (
    <div className="bg-white border border-gray-200 rounded-lg p-3 mb-2 shadow-sm max-w-xs">
      <div className="font-medium text-sm text-gray-900">{product.name}</div>
      <div className="text-blue-600 font-semibold">{product.price}₸</div>
      <div className="text-xs text-gray-600">SKU: {product.sku}</div>
      {product.url && (
        <a 
          href={product.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:text-blue-700 mt-1 block"
        >
          Подробнее
        </a>
      )}
    </div>
  );

  const MessageBubble = ({ message }: { message: Message }) => (
    <div className={`mb-4 ${message.sender === 'user' ? 'text-right' : 'text-left'}`}>
      <div className={`inline-block max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
        message.sender === 'user'
          ? 'bg-blue-600 text-white'
          : message.isError
          ? 'bg-red-50 text-red-700 border border-red-200'
          : 'bg-gray-50 text-gray-900'
      } shadow-md`}>
        <div className="text-sm whitespace-pre-wrap">{message.text}</div>
        
        {message.products && message.products.length > 0 && (
          <div className="mt-2">
            {message.products.map((product: Product, index: number) => (
              <ProductCard key={index} product={product} />
            ))}
          </div>
        )}
        
        {message.orderId && (
          <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
            <CheckCircle size={12} className="inline mr-1 text-green-500" />
            Заказ создан: <strong>{message.orderId}</strong>
          </div>
        )}
      </div>
      
      <div className={`text-xs text-gray-500 mt-1 ${
        message.sender === 'user' ? 'text-right' : 'text-left'
      }`}>
        {formatTime(message.timestamp)}
      </div>
    </div>
  );

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-96 h-[500px] flex flex-col mb-4 transition-all duration-300" role="dialog" aria-label="Chat Widget">
          <div className="bg-blue-600 text-white p-4 rounded-t-xl flex justify-between items-center">
            <div>
              <h3 className="font-bold text-lg">Kerneu Group</h3>
              <p className="text-xs text-blue-100">Помощник по заказам</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white hover:text-gray-200 transition-colors"
              aria-label="Close chat"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 p-5 overflow-y-auto bg-gray-50">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            
            {isTyping && (
              <div className="text-left mb-4">
                <div className="inline-block bg-gray-50 px-4 py-2 rounded-lg shadow-sm">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-blue-300 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-300 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-2 h-2 bg-blue-300 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-gray-200 bg-white rounded-b-xl">
            <div className="flex space-x-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(inputText);
                  }
                }}
                placeholder="Напишите сообщение..."
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                disabled={isTyping}
                aria-label="Type your message"
              />
              <button
                onClick={() => sendMessage(inputText)}
                disabled={!inputText.trim() || isTyping}
                className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-all duration-200 hover:scale-105"
          aria-label="Open chat"
        >
          <MessageCircle size={24} />
        </button>
      )}
    </div>
  );
};

export default WebChatWidget;