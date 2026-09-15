import React, { Component } from 'react';
import ReactDOM from 'react-dom';

class MessageList extends Component {
  componentWillUpdate() {
    const node = ReactDOM.findDOMNode(this);
    if (!node) return;
    this.shouldScrollToBottom = node.scrollTop + node.clientHeight + 120 >= node.scrollHeight;
  }

  componentDidUpdate() {
    if (!this.shouldScrollToBottom) return;
    const node = ReactDOM.findDOMNode(this);
    if (node) node.scrollTop = node.scrollHeight;
  }

  render() {
    return (
      <div className="chat-body">
        {this.props.messages.map((message, index) => {
          const system = message.system;
          const mine = !system && message.username === this.props.me;
          return (
            <div key={index} className={`bubble-row ${system ? 'system' : (mine ? 'mine' : 'theirs')}`}>
              {!mine && !system ? <span className="bubble-name">{message.username}</span> : null}
              <div className="bubble">{message.text}</div>
            </div>
          );
        })}
      </div>
    );
  }
}

export default MessageList;
