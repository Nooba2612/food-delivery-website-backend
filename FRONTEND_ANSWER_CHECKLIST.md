# ✅ Frontend Answer Signal Checklist

## 🎯 Vấn Đề Hiện Tại

Frontend báo: `answers: 0` ⟹ **Backend không nhận/gửi lại answer**

---

## 📋 Checklist: Frontend Phải Gửi Answer Đúng Format

### **1️⃣ Khi Nhận Offer, Frontend Phải Tạo Answer**

```javascript
// ❌ SAI: Không tạo answer
socket.on("offer", (data) => {
    console.log("Nhận offer");
    // ... nhưng không gửi answer lại!
});

// ✅ ĐÚNG: Phải tạo và gửi answer
socket.on("offer", async (data) => {
    console.log("📥 Nhận offer từ initiator");

    const { callId, offer } = data;

    // ✅ CRITICAL: Tạo answer từ offer
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        console.log("🎉 ANSWER CREATED!");
        console.log("   Answer type:", answer.type);
        console.log("   Answer SDP length:", answer.sdp.length);

        // ✅ Gửi answer lại cho backend
        socket.emit("answer", {
            callId: callId, // ⚠️ CRITICAL: Gửi callId
            answer: answer, // ⚠️ CRITICAL: Gửi toàn bộ RTCSessionDescription
            toUserId: initiatorId, // Optional: Có thể gửi initiator ID
            timestamp: Date.now(),
        });

        console.log("📤 Answer signal sent to backend");
    } catch (error) {
        console.error("❌ Failed to create answer:", error);
    }
});
```

---

### **2️⃣ Answer Object Phải Có Chính Xác Cấu Trúc**

**Kiểm tra bên Frontend:**

```javascript
// ❌ SAI: Answer không đầy đủ
socket.emit("answer", {
    callId: data.callId,
    // ❌ Thiếu: answer object!
});

// ✅ ĐÚNG: Answer phải có type và sdp
socket.emit("answer", {
    callId: data.callId,
    answer: {
        type: "answer", // ✅ Phải là "answer"
        sdp: "v=0\r\no=...", // ✅ Phải có SDP string
    },
    toUserId: callerId, // ✅ Là ID của người gửi offer (initiator)
});

// Kiểm tra answer object
if (!answer.type || !answer.sdp) {
    console.error("❌ Answer không có type hoặc sdp!", answer);
}
```

---

### **3️⃣ Answer Phải Chứa Audio Media**

**Kiểm tra SDP:**

```javascript
// ❌ SAI: SDP không có audio
const sdp = answer.sdp;
if (!sdp.includes("m=audio")) {
    console.error("❌ SDP KHÔNG CÓ AUDIO! Không thể có tiếng!");
    console.error("   SDP:", sdp.substring(0, 300));
}

// ✅ ĐÚNG: SDP phải chứa audio
console.log("✅ SDP contains audio:", answer.sdp.includes("m=audio"));
console.log("✅ SDP contains opus codec:", answer.sdp.includes("opus"));
```

**Typical audio SDP:**

```
m=audio 9 UDP/TLS/RTP/SAVPF 111 63 103...
a=rtpmap:111 opus/48000/2
a=setup:active
```

---

### **4️⃣ Timing: Answer Phải Gửi Sau Khi Peer Ready**

```javascript
let peerReady = false;

// ✅ Chờ peer có thể tạo answer
peerConnection.addEventListener("connectionstatechange", () => {
    if (peerConnection.connectionState === "connected") {
        peerReady = true;
        console.log("✅ Peer connection ready for signals");
    }
});

socket.on("offer", async (data) => {
    if (!peerReady) {
        console.warn("⚠️ Peer not ready yet, waiting...");
        // Chờ peer ready hoặc setup offer trước
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // ✅ Gửi answer
    socket.emit("answer", {
        callId: data.callId,
        answer: answer,
        toUserId: data.callerId,
    });
});
```

---

### **5️⃣ Log Để Verify Answer Được Gửi**

**Frontend phải log:**

```javascript
socket.on("offer", async (data) => {
    console.log("📥 === OFFER RECEIVED ===");
    console.log("   callId:", data.callId);
    console.log("   offer type:", data.offer?.type);
    console.log("   has SDP:", !!data.offer?.sdp);
    console.log("   SDP length:", data.offer?.sdp?.length);

    // ... tạo answer ...

    console.log("📤 === SENDING ANSWER ===");
    console.log("   callId:", data.callId);
    console.log("   answer.type:", answer.type);
    console.log("   answer.sdp length:", answer.sdp.length);
    console.log("   has audio:", answer.sdp.includes("m=audio"));
    console.log("   to initiator:", data.callerId);

    socket.emit("answer", {
        callId: data.callId,
        answer: answer,
        toUserId: data.callerId,
    });

    console.log("   ✅ emit('answer') called");
});
```

---

### **6️⃣ Kiểm Tra Backend Logs Sau Khi Fix**

**Backend sẽ log khi nhận answer:**

```
🔴🔴 [BACKEND-ANSWER] ANSWER RECEIVED 🔴🔴🔴
📥 answer received: {
  callId: "...",
  hasCallerId: true,
  hasToUserId: false,
  hasAnswer: true,
  answerType: "answer",
  hasAnswerSDP: true,
  fromUserId: "recipient_id"
}
🔴 [BACKEND-ANSWER] Extracted values: callerId=..., toUserId=..., callId=...
🔴 [BACKEND-ANSWER] Initial targetUserId: ...
📞 Resolved callerId from callId: initiator_id
🔴 [BACKEND-ANSWER] Will send to room: user:initiator_id
✅✅✅ [BACKEND-ANSWER] Answer forwarded to user:initiator_id for call: ... ✅✅✅
```

**Nếu log này không xuất hiện ⟹ Frontend chưa gửi answer**

---

## 🚨 Common Frontend Issues

| Vấn Đề                   | Triệu Chứng                 | Fix                                                   |
| ------------------------ | --------------------------- | ----------------------------------------------------- |
| Không tạo answer         | answers: 0                  | Thêm `createAnswer()` khi nhận offer                  |
| Answer object thiếu data | hasAnswer: false            | Verify `answer.type` và `answer.sdp` trước emit       |
| Answer không có audio    | hasAnswerSDP: false         | Check `sdp.includes("m=audio")` - audio track missing |
| Không emit answer event  | [BACKEND-ANSWER] not logged | Check socket.emit("answer", ...) được gọi             |
| Gửi sai structure        | "Cannot forward: Missing"   | Verify data structure matches checklist               |
| Timing issue             | answer received sau 15s     | Ensure peer ready trước khi gửi answer                |

---

## 📞 Debug Steps

1. **Verify Frontend Logs:**

    ```
    📥 === OFFER RECEIVED === ✅
    📤 === SENDING ANSWER === ✅
    ✅ emit('answer') called ✅
    ```

2. **Verify Backend Logs** (sau khi fix):

    ```
    🔴🔴 [BACKEND-ANSWER] ANSWER RECEIVED 🔴🔴🔴 ✅
    ✅✅✅ [BACKEND-ANSWER] Answer forwarded ✅
    ```

3. **Verify Frontend Nhận Answer Lại:**

    ```
    📞 [socket.on.answer] RECEIVED ANSWER ✅
    ✅ Remote SDP set successfully ✅
    ```

4. **Verify Audio Streaming:**
    ```
    📥 [peer.on.stream] Received remote media stream ✅
    ✅ Audio playing! 🎵
    ```

---

**Next Step:** Share frontend offer/answer code để tôi kiểm tra!
