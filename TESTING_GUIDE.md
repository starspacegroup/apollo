# Testing Guide: Text and Voice Chat Integration

## Prerequisites

1. **OpenAI API Key**: Set in `.env` file or as Cloudflare Worker secret
2. **Development Server**: Run `npm run dev`
3. **Browser**: Modern browser with WebSocket and Web Audio API support
4. **Microphone**: Required only for voice chat testing

## Test Scenarios

### 1. Text-Only Chat (Primary Flow)

**Objective**: Verify text chat works without any voice functionality

**Steps**:

1. Open `http://localhost:8787/` in browser
2. Verify initial state shows "Ready" status
3. Verify empty state message shows both text and voice options
4. Type "Hello, can you help me?" in the text input
5. Press Enter to send

**Expected Results**:

- ✅ WebSocket connects automatically (status changes to "Connected")
- ✅ User message appears in transcript immediately
- ✅ AI response appears in transcript
- ✅ Text input remains available for next message
- ✅ "Start Voice Chat" button is visible

**Pass Criteria**: Can have entire conversation using only text

---

### 2. Starting with Voice Chat

**Objective**: Verify voice chat can be initiated directly

**Steps**:

1. Open fresh page (or refresh)
2. Click "Start Voice Chat" button
3. Grant microphone permission when prompted
4. Say "Hello, this is a test"
5. Wait for AI response

**Expected Results**:

- ✅ Microphone permission prompt appears
- ✅ Status changes to "Connected"
- ✅ "Recording indicator" appears with pulsing dot
- ✅ Speech is transcribed and appears in transcript
- ✅ AI responds with voice (audio plays)
- ✅ AI response transcription appears in transcript
- ✅ Button changes to "Stop Voice"

**Pass Criteria**: Voice conversation works end-to-end

---

### 3. Text-to-Voice Transition (Seamless Mode)

**Objective**: Verify smooth transition from text to voice in same session

**Steps**:

1. Start with text chat (send 2-3 messages)
2. Click "Start Voice Chat" button
3. Grant microphone permission
4. Speak a message
5. Wait for AI voice response

**Expected Results**:

- ✅ Previous text messages remain in transcript
- ✅ Voice mode activates without interrupting conversation
- ✅ WebSocket connection maintained (not reconnected)
- ✅ Voice transcription appears after previous text messages
- ✅ Conversation context is preserved

**Pass Criteria**: Seamless transition with full context retention

---

### 4. Voice-to-Text Transition

**Objective**: Verify can return to text chat after using voice

**Steps**:

1. Start voice chat and have 1-2 voice exchanges
2. Click "Stop Voice" button
3. Type a text message
4. Send the message

**Expected Results**:

- ✅ Microphone is released (indicator disappears)
- ✅ "Start Voice Chat" button reappears
- ✅ WebSocket remains connected
- ✅ Text message sends successfully
- ✅ AI responds with text only
- ✅ Previous voice messages remain in transcript

**Pass Criteria**: Can continue conversation with text after stopping voice

---

### 5. Multiple Mode Switches

**Objective**: Verify multiple switches between text and voice

**Steps**:

1. Start with text (send 1 message)
2. Start voice chat (say 1 thing)
3. Stop voice (send 1 text message)
4. Start voice again (say 1 thing)
5. Stop voice (send 1 text message)

**Expected Results**:

- ✅ Each transition works smoothly
- ✅ Full conversation history maintained
- ✅ No connection interruptions
- ✅ Resources properly acquired/released
- ✅ AI maintains conversation context throughout

**Pass Criteria**: Can switch modes multiple times without issues

---

### 6. End Session

**Objective**: Verify complete disconnection

**Steps**:

1. Start any type of chat (text or voice)
2. Have a conversation with multiple messages
3. Click "End Session" button
4. Try to send a new message

**Expected Results**:

- ✅ Status changes to "Ready"
- ✅ Transcript is cleared
- ✅ All resources released
- ✅ New message triggers fresh connection
- ✅ Previous conversation is lost (as expected)

**Pass Criteria**: Clean disconnection and fresh start capability

---

### 7. Keyboard Shortcuts

**Objective**: Verify keyboard interactions work correctly

**Steps**:

1. Open chat interface
2. Type a message
3. Press Enter (should send)
4. Type another message
5. Press Shift+Enter (should create new line)
6. Press Enter again (should send with new line)

**Expected Results**:

- ✅ Enter sends message
- ✅ Shift+Enter creates new line
- ✅ Multi-line messages send correctly
- ✅ Text input clears after send
- ✅ Focus remains on input after send

**Pass Criteria**: Keyboard shortcuts work as documented

---

### 8. Error Handling - No Microphone Permission

**Objective**: Verify graceful handling of denied microphone access

**Steps**:

1. Open chat interface
2. Click "Start Voice Chat"
3. Deny microphone permission
4. Try to send a text message

**Expected Results**:

- ✅ Error message appears explaining microphone issue
- ✅ Can still use text chat
- ✅ Can try voice again later
- ✅ No application crash

**Pass Criteria**: Graceful fallback to text-only mode

---

### 9. Connection Recovery

**Objective**: Verify handling of connection interruptions

**Steps**:

1. Start text chat
2. Disable network (simulate disconnect)
3. Try to send a message
4. Re-enable network
5. Try to send another message

**Expected Results**:

- ✅ Error message shows connection issue
- ✅ Status updates to reflect disconnection
- ✅ Reconnection attempt on next message
- ✅ Connection restored successfully

**Pass Criteria**: Handles disconnection gracefully and can recover

---

### 10. Concurrent AI Response Handling

**Objective**: Verify proper handling of interruptions

**Steps**:

1. Start voice chat
2. Speak a question that triggers long AI response
3. Interrupt by speaking again mid-response
4. Verify AI stops current response and processes new input

**Expected Results**:

- ✅ AI stops speaking when interrupted
- ✅ Audio queue is cleared
- ✅ New input is processed
- ✅ Transcript shows both partial and new response
- ✅ No audio overlap or glitches

**Pass Criteria**: Interruptions handled cleanly with proper cancellation

---

## Browser Compatibility Testing

Test in the following browsers:

- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Chrome (Android)
- [ ] Mobile Safari (iOS)

## Performance Testing

Monitor the following during extended use:

- [ ] Memory usage stays stable
- [ ] No memory leaks after multiple sessions
- [ ] Audio playback remains smooth
- [ ] WebSocket connection stable over time
- [ ] UI remains responsive during audio streaming

## Accessibility Testing

- [ ] Keyboard navigation works throughout
- [ ] Screen readers can access transcript
- [ ] Status indicators are announced
- [ ] Error messages are clear and helpful
- [ ] All interactive elements have proper labels

## Known Limitations

1. **Browser Support**: Requires modern browser with WebSocket and Web Audio API
2. **Microphone Access**: Voice features require user permission
3. **API Costs**: OpenAI Realtime API usage incurs costs per session
4. **Network Requirements**: Requires stable internet for real-time streaming
5. **Context Window**: Long conversations may exceed context limits

## Reporting Issues

When reporting issues, include:

1. Browser and version
2. Steps to reproduce
3. Expected vs actual behavior
4. Console errors (if any)
5. Network conditions
6. Test scenario being performed
