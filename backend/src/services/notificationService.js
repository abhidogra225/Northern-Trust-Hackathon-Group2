const sendNotification = (req, res) => {
    const { orderId, email } = req.body;
    console.log(`[Notification Service] Sending confirmation email to ${email || 'customer'}...`);

    setTimeout(() => {
        console.log(`[Notification Service] ✅ Notification dispatched for order ${orderId}`);
        res.status(200).json({ 
            success: true, 
            message: "Notification sent successfully." 
        });
    }, 500); // Fast 500ms processing delay
};

module.exports = {
    sendNotification
};