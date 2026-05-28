const arrangeShipping = (req, res) => {
    const { orderId } = req.body;
    console.log(`[Shipping Service] Generating shipping label for order ${orderId}...`);

    setTimeout(() => {
        console.log(`[Shipping Service] ✅ Waybill generated for order ${orderId}`);
        res.status(200).json({ 
            success: true, 
            trackingId: `SHIP-${Math.floor(Math.random() * 900000)}` 
        });
    }, 1200); // 1.2-second mock processing delay
};

module.exports = {
    arrangeShipping
};