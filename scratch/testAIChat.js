require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { chat } = require('../src/modules/Admin/adminAIChat.controller');

const run = async () => {
  const mockRes = (label) => ({
    status: (code) => {
      console.log(`[${label}] STATUS:`, code);
      return mockRes(label);
    },
    json: (data) => {
      console.log(`[${label}] RESPONSE:\n`, data.reply || data.message);
      console.log('--------------------------------------------------\n');
    }
  });

  console.log('Sending Test 1 (Valid Eatsy Query)...');
  await chat({
    body: {
      message: 'Làm thế nào để thêm sản phẩm mới vào thực đơn?'
    }
  }, mockRes('Test 1 - Valid Eatsy Query'));

  console.log('Sending Test 2 (Out of Scope Query)...');
  await chat({
    body: {
      message: 'Hãy viết cho tôi một bài thơ về mùa thu ở Hà Nội và một đoạn code Python tính số Fibonacci.'
    }
  }, mockRes('Test 2 - Out of Scope Query'));
};

run().catch(console.error);
