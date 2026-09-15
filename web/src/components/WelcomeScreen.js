import React, { Component } from 'react';

class WelcomeScreen extends Component {
  state = { name: '' };

  handleChange = (e) => this.setState({ name: e.target.value });

  handleSubmit = (e) => {
    e.preventDefault();
    this.props.onEnter(this.state.name);
  };

  render() {
    return (
      <div className="welcome">
        <div className="welcome-orbit">
          <div className="welcome-earth">🌍</div>
          <div className="welcome-moon">🌙</div>
        </div>
        <h1 className="welcome-title">CoupleRoom</h1>
        <p className="welcome-sub">a tiny universe for two</p>
        <form onSubmit={this.handleSubmit} className="welcome-form">
          <input
            className="welcome-input"
            placeholder="your name"
            value={this.state.name}
            onChange={this.handleChange}
            maxLength={24}
            autoFocus
          />
          <button className="welcome-btn" type="submit">enter our room 💖</button>
        </form>
      </div>
    );
  }
}

export default WelcomeScreen;
