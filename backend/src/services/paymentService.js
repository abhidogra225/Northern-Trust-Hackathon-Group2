// Track payment attempts in-memory to trigger a failure on the first try
let paymentAttempts = 0;

const processPayment = (req, res) => {
    const { orderId, amount } = req.body;
    paymentAttempts++;

    console.log(`[Payment Service] Processing order ${orderId} for $${amount}...`);

    // Demo Strategy: Intentionally fail on the 1st attempt to showcase retry logic
    if (paymentAttempts === 1) {
        console.log(`[Payment Service] ❌ Simulating intentional payment failure for order ${orderId}`);
        return res.status(500).json({ 
            success: false, 
            message: "Payment gateway timeout. Please retry." 
        });
    }

    // Success on subsequent attempts
    setTimeout(() => {
        console.log(`[Payment Service] ✅ Payment successful for order ${orderId}`);
        res.status(200).json({ 
            success: true, 
            transactionId: `TXN-${Math.floor(Math.random() * 90000) + 10000}` 
        });
    }, 1000); // 1-second mock network delay
};

module.exports = {
    processPayment
};