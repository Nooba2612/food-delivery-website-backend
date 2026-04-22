# 🎤 Hướng Dẫn Kiểm Tra Lỗi Âm Thanh - Backend

## 📋 Tóm Tắt Vấn Đề Hiện Tại

- **Triệu chứng**: Cuộc gọi được thiết lập nhưng không có âm thanh (nghe không thấy gì)
- **Trạng thái WebRTC**: Offer nhận được ✅, nhưng **ANSWER không được gửi lại** ❌
- **Nguyên nhân**: Remote peer (người nhận) không tạo được answer hoặc answer không được gửi về

---

## 🔍 Checklist Kiểm Tra Backend

### 1. **Kiểm Tra Signal Forwarding (Chuyển Tiếp Tín Hiệu)**

#### ❌ **Vấn đề**: Backend không chuyển tiếp `answer` từ peer nhận về peer gửi

```javascript
// ✅ ĐÚNG: Backend cần nhận và chuyển tiếp answer
socket.on("answer", (data) => {
    console.log("📞 Received answer from peer:", data);

    // ✅ Chuyển tiếp đến người nhận cuộc gọi
    const targetUser = getConnectedUser(data.toUserId);
    if (targetUser && targetUser.socket) {
        targetUser.socket.emit("answer", {
            callId: data.callId,
            answer: data.answer,
            fromUserId: socket.userId, // Thêm userId người gửi
        });
        console.log("✅ Answer forwarded successfully");
    } else {
        console.error("❌ Target user not found or disconnected");
    }
});
```

**Kiểm tra:**

- [ ] Backend có nhận được event `answer` từ client?
- [ ] Event `answer` có được emit đến socket của người gọi không?
- [ ] Data `answer` có chứa SDP không?

---

### 2. **Kiểm Tra ICE Candidate Forwarding**

#### ❌ **Vấn đề**: Backend không chuyển tiếp ICE candidates đầy đủ

```javascript
// ✅ ĐÚNG: Chuyển tiếp tất cả ICE candidates
socket.on("ice_candidate", (data) => {
    console.log("❄️ Received ICE candidate:", {
        callId: data.callId,
        hasCandidateData: !!data.candidate,
    });

    // ✅ Chuyển tiếp ngay lập tức
    const targetUser = getConnectedUser(data.toUserId);
    if (targetUser && targetUser.socket) {
        targetUser.socket.emit("ice_candidate", {
            callId: data.callId,
            candidate: data.candidate,
            sdpMLineIndex: data.sdpMLineIndex,
            sdpMid: data.sdpMid,
            fromUserId: socket.userId,
        });
    }
});
```

**Kiểm tra:**

- [ ] Có log ICE candidates được nhận không?
- [ ] Có log ICE candidates được gửi đi không?
- [ ] Số lượng ICE candidates được gửi/nhận có khớp không?

---

### 3. **Kiểm Tra Call State Management**

#### ❌ **Vấn đề**: Call không được mark là "active" trên backend, nên signals bị drop

```javascript
// ✅ ĐÚNG: Lưu trạng thái call và map peer IDs
const activeCallsMap = new Map();

socket.on("initiate_call", async (data) => {
    const callId = data.callId;

    // ✅ Lưu mapping giữa callId và hai user IDs
    activeCallsMap.set(callId, {
        initiatorId: socket.userId,
        recipientId: data.toUserId,
        initiatorSocket: socket.id,
        recipientSocket: null, // Sẽ được set khi recipient accept
        status: "pending",
        createdAt: Date.now(),
    });

    console.log(`✅ Call ${callId} initiated by ${socket.userId}`);
});

socket.on("call_accepted", (data) => {
    const callId = data.callId;
    const callInfo = activeCallsMap.get(callId);

    if (callInfo) {
        callInfo.recipientSocket = socket.id;
        callInfo.status = "active";
        console.log(`✅ Call ${callId} is now ACTIVE`);
    }
});
```

**Kiểm tra:**

- [ ] Backend có lưu callId mapping không?
- [ ] Trạng thái call được cập nhật khi accept không?
- [ ] Backend có biết cần chuyển tiếp signals cho ai không?

---

### 4. **Kiểm Tra Offer/Answer Có Chứa Audio**

#### ❌ **Vấn đề**: Offer/Answer không chứa media description `m=audio`

```javascript
// ✅ ĐÚNG: Log và validate SDP
function validateSDP(sdp, type = "offer") {
    if (!sdp) {
        console.error(`❌ ${type} SDP is empty!`);
        return false;
    }

    if (!sdp.includes("m=audio")) {
        console.error(`❌ ${type} SDP does NOT contain audio media!`);
        console.error(`   SDP preview: ${sdp.substring(0, 200)}`);
        return false;
    }

    if (!sdp.includes("m=video")) {
        console.warn(`⚠️ ${type} SDP does NOT contain video media (this is OK for voice calls)`);
    }

    console.log(`✅ ${type} SDP is valid and contains audio`);
    return true;
}

socket.on("offer", (data) => {
    if (!validateSDP(data.offer.sdp, "OFFER")) {
        console.error("❌ Invalid offer - rejecting");
        return;
    }
    // ... continue forwarding
});
```

**Kiểm tra:**

- [ ] Log toàn bộ Offer/Answer SDP từ client
- [ ] SDP có chứa `m=audio` không?
- [ ] SDP có chứa các codec audio không (vd: opus)?
- [ ] SDP setup có chứa connection info không?

---

### 5. **Kiểm Tra Socket Connection State**

#### ❌ **Vấn đề**: Socket bị disconnect hoặc khác namespace

```javascript
// ✅ ĐÚNG: Verify socket connected trước khi emit
socket.on("offer", (data) => {
    const callInfo = activeCallsMap.get(data.callId);

    if (!callInfo) {
        console.error(`❌ Call ${data.callId} not found in active calls`);
        return;
    }

    // Tìm socket của recipient
    const recipientSocket = io.sockets.sockets.get(callInfo.recipientSocket);

    if (!recipientSocket) {
        console.error(`❌ Recipient socket ${callInfo.recipientSocket} not found`);
        console.error(`   Recipient may have disconnected`);
        return;
    }

    if (!recipientSocket.connected) {
        console.error(`❌ Recipient socket not connected`);
        return;
    }

    // ✅ Safe to emit
    recipientSocket.emit("offer", {
        callId: data.callId,
        offer: data.offer,
        fromUserId: socket.userId,
    });
});
```

**Kiểm tra:**

- [ ] Recipient socket còn connected không?
- [ ] Recipient socket có đúng user không?
- [ ] Socket.emit() có throw error không?

---

### 6. **Kiểm Tra Call Timing Issues**

#### ❌ **Vấn đề**: Answer được gửi trước khi recipient client setup peer

```javascript
// ⚠️ PROBLEM: Timing issue
socket.on("call_accepted", (data) => {
    // ❌ Bad: Gửi answer ngay lập tức
    recipientSocket.emit("answer", data.answer);
});

// ✅ BETTER: Add small delay để recipient client setup peer
socket.on("call_accepted", (data) => {
    setTimeout(() => {
        recipientSocket.emit("answer", data.answer);
    }, 100); // Wait 100ms for client to setup peer
});
```

**Kiểm tra:**

- [ ] Answer được emit bao lâu sau `acceptCall` được gọi?
- [ ] Có race condition giữa `acceptCall` và answer emit không?
- [ ] Client có warn về "pending signals" không?

---

### 7. **Kiểm Tra Error Handling & Logging**

#### ✅ **Thêm logging toàn diện:**

```javascript
// Signal forwarding với full logging
function forwardSignal(callId, signalType, signalData, fromUserId, toUserId) {
    console.log(`\n📤 [Forward ${signalType}] Starting`);
    console.log(`   ├─ callId: ${callId}`);
    console.log(`   ├─ from: ${fromUserId}`);
    console.log(`   ├─ to: ${toUserId}`);
    console.log(`   └─ has data: ${!!signalData}`);

    try {
        const callInfo = activeCallsMap.get(callId);
        if (!callInfo) {
            console.error(`❌ Call ${callId} not found`);
            return false;
        }

        const targetSocketId =
            fromUserId === callInfo.initiatorId ? callInfo.recipientSocket : callInfo.initiatorSocket;

        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (!targetSocket || !targetSocket.connected) {
            console.error(`❌ Target socket not connected`);
            return false;
        }

        console.log(`   ✅ Emitting to socket ${targetSocketId}`);
        targetSocket.emit(signalType, {
            callId,
            [signalType]: signalData,
            fromUserId,
        });
        console.log(`   ✅ ${signalType} forwarded successfully\n`);
        return true;
    } catch (error) {
        console.error(`❌ Error forwarding ${signalType}:`, error.message);
        return false;
    }
}
```

---

## 📊 Kiểm Tra Từng Bước

### **Step 1: Offer Being Received?**

```
Backend log: "📞 [socket.on.offer] RECEIVED OFFER"
↓
Backend logs: "✅ Offer contains m=audio"
↓
Backend logs: "✅ Offer forwarded to recipient"
```

### **Step 2: Answer Being Generated?**

```
Recipient client logs: "📤 [peer.on.signal] TRIGGERED! Signal type: answer"
↓
Recipient client logs: "🎉 ANSWER GENERATED!"
↓
Backend log: "📞 [socket.on.answer] RECEIVED ANSWER"
```

### **Step 3: Answer Being Sent Back?**

```
Backend log: "✅ Answer forwarded to initiator"
↓
Initiator client log: "📞 [socket.on.answer] RECEIVED ANSWER"
```

### **Step 4: Stream Arriving?**

```
Initiator client log: "📥 [peer.on.stream] Received remote media stream"
↓
✅ Audio should start working!
```

---

## 🚨 Common Backend Issues

| Issue                   | Symptom                     | Fix                                                |
| ----------------------- | --------------------------- | -------------------------------------------------- |
| Answer not forwarded    | Offers: 1, Answers: 0       | Check `socket.on("answer")` - is it emitting?      |
| Socket disconnected     | Recipient socket not found  | Check socket.io connection/namespaces              |
| Wrong socket ID mapping | Signals going to wrong user | Verify callInfo mapping in activeCallsMap          |
| Answer timing           | "pending signals: 0"        | Add 50-100ms delay before emitting answer          |
| Missing SDP data        | "answer missing SDP"        | Verify data structure: `{ answer: { sdp, type } }` |
| ICE not flowing         | "iceCandidates: 0"          | Check ICE candidate forwarding logic               |

---

## 📝 Required Backend Changes

```javascript
// ✅ Minimum required fixes:

1. ✅ socket.on("answer") MUST emit "answer" event to initiator
2. ✅ socket.on("ice_candidate") MUST forward ALL candidates
3. ✅ Call state MUST track which user is which socket
4. ✅ Answer SDP MUST contain "m=audio"
5. ✅ Socket emit MUST check if target is connected
6. ✅ Add logging for EVERY signal forward
```

---

## 🔗 Frontend Diagnostic Info

**Current client diagnostic (15s timeout):**

```
- Signals processed: { offers: 1, answers: 0, iceCandidates: 14 }
- Peer ready: true
- Pending signals: 0
- Peer instance: true
```

**Meaning**: Answer is not being sent from backend, even though:

- ✅ Peer is ready to receive signals
- ✅ 14 ICE candidates were received (network is working)
- ✅ Offer was received and processed

**Conclusion**: Backend is not forwarding the Answer signal properly.

---

## 📞 Contact

Nếu cần support thêm, cung cấp:

1. Backend logs từ khi `acceptCall` được gọi đến khi `15s timeout`
2. Xác nhận answer event có được emit không
3. Check socket connection status
