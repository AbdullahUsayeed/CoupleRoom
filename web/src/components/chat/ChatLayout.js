import React, { Component } from 'react';
import MessageList from './MessageList';
import SendMessageForm from './SendMessageForm';

class ChatLayout extends Component {
  state = { password: '' };

  handlePassword = (e) => this.setState({ password: e.target.value });

  handleUnlock = (e) => {
    e.preventDefault();
    const password = this.state.password;
    if (!password) return;
    this.setState({ password: '' });
    if (this.props.onAuth) this.props.onAuth(password);
  };

  render() {
    const {
      messages, users, typingUser, chatOpen, onClose, onSend, onTyping, username,
      chatRequired, chatVerified, chatError
    } = this.props;
    const locked = chatRequired && !chatVerified;

    return (
      <aside className={`chat-glass ${chatOpen ? 'open' : ''}`}>
        <div className="chat-head">
          <span className="chat-title">💬 our chat</span>
          <span className="chat-users">{users.join(' · ')}</span>
          <button className="chat-close" type="button" onClick={onClose} aria-label="Close chat">✕</button>
        </div>

        {locked ? (
          <div className="chat-lock">
            <div className="chat-lock-emoji">🔒</div>
            <p className="chat-lock-text">enter the room password to read and send messages</p>
            <form className="chat-lock-form" onSubmit={this.handleUnlock}>
              <input
                className="chat-input"
                type="password"
                placeholder="room password"
                value={this.state.password}
                onChange={this.handlePassword}
                autoComplete="current-password"
              />
              <button className="chat-send" type="submit">unlock</button>
            </form>
            {chatError ? <div className="chat-lock-error">{chatError}</div> : null}
          </div>
        ) : (
          <React.Fragment>
            <MessageList messages={messages} me={username} />
            {typingUser ? <div className="typing">{typingUser} is typing…</div> : <div className="typing typing-empty">·</div>}
            <SendMessageForm onSend={onSend} onTyping={onTyping} />
          </React.Fragment>
        )}
      </aside>
    );
  }
}

export default ChatLayout;
