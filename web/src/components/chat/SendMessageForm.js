import React, { Component } from 'react';

class SendMessageForm extends Component {
  state = { message: '' };

  handleChange = (e) => {
    this.setState({ message: e.target.value });
    if (this.props.onTyping) this.props.onTyping(e.target.value.length > 0);
  };

  handleSubmit = (e) => {
    e.preventDefault();
    const text = this.state.message.trim();
    if (!text) return;
    this.props.onSend(text);
    this.setState({ message: '' });
    if (this.props.onTyping) this.props.onTyping(false);
  };

  render() {
    return (
      <form className="chat-form" onSubmit={this.handleSubmit}>
        <input
          className="chat-input"
          placeholder="say something sweet…"
          value={this.state.message}
          onChange={this.handleChange}
          maxLength={1000}
        />
        <button className="chat-send" type="submit">send</button>
      </form>
    );
  }
}

export default SendMessageForm;
