import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";
import { useAuth } from "../context/AuthContext";
import AnimatedBubbles from "../components/AnimatedBubbles/AnimatedBubbles";

function CheckoutPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth(); // ✅ logged-in user info

  const [loading, setLoading] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [currentBookingId, setCurrentBookingId] = useState(null);

  // START: Coupon Code State
  const [couponCode, setCouponCode] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");
  // END: Coupon Code State

  const getCheckoutData = () => {
    if (location.state) {
      return location.state;
    }
    const dataFromStorage = localStorage.getItem("checkoutData");

    if (dataFromStorage) {

      return JSON.parse(dataFromStorage);

    }
    return {};
  };

  const checkoutData = getCheckoutData();
  const {
    adultCount,
    childCount,
    date,
    resortName,
    paid,
    totalamount,
    resortId,
    waternumber,
    terms,
    paymentType,
  } = checkoutData;


  const formattedDate = new Date(date).toISOString().split("T")[0];
  const [billingDetails, setBillingDetails] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    waternumber: waternumber,
    email: "",
    city: "",
    date: formattedDate, // ✅ sending ISO-supported date
    createAccount: false,
    total: totalamount,
    advance: paid,
    terms
  });

  useEffect(() => {
    if (user) {
      const nameParts = user.name ? user.name.split(" ") : [""];
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ");

      setBillingDetails((prevDetails) => ({
        ...prevDetails,
        firstName: firstName || "",
        lastName: lastName || "",
        email: user.email || "",
        phone: user.phone || "",
      }));
    }
  }, [user]);

  const [paymentMethod, setPaymentMethod] = useState("razorpay");

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setBillingDetails((prevDetails) => ({
      ...prevDetails,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // START: Handle Apply Coupon Function
  const handleApplyCoupon = async () => {
    if (!couponCode) {
      toast.error("Please enter a coupon code.");
      return;
    }
    try {
      // Create cart items array for product-specific coupons
      const cartItems = [{
        product: resortId, // Send the product ID directly
        price: totalamount,
        quantity: 1,
        name: resortName
      }];

      const response = await axios.post(
        `${import.meta.env.VITE_APP_API_BASE_URL}/api/coupons/validate`,
        {
          code: couponCode,
          cartTotal: totalamount, // Using original paid for validation\

          cartItems: cartItems
        }
      );

      if (response.data.success) {
        const { coupon, discountAmount, message, applicableItems } = response.data.data;
        setAppliedCoupon(coupon);
        setDiscountAmount(discountAmount);

        setCouponError(""); // Clear previous errors
        toast.success(message);
      } else {
        setCouponError(response.data.message);
        setDiscountAmount(0); // Reset discount if coupon is invalid
        setAppliedCoupon(null);
        toast.error(response.data.message);
      }
    } catch (error) {
      console.error("Error validating coupon:", error);
      const errorMessage = error.response?.data?.message || "Invalid coupon code";
      toast.error(errorMessage);
      setCouponError(errorMessage);
    }
  };
  // END: Handle Apply Coupon Function

  // Calculate final total after discount
  const discountedTotalAmount = totalamount - discountAmount;
  const finalTotal = paid; // Advance amount remains the same
  const remainingAmount = discountedTotalAmount - finalTotal;




  // PhonePe payment verification
  const verifyPhonePePayment = async (orderId, merchantOrderId, customBookingId) => {
    try {
      console.log("[PhonePe Verify] Starting...");

      // Check booking status first
      const statusResponse = await axios.get(
        `${import.meta.env.VITE_APP_API_BASE_URL}/api/bookings/status/${customBookingId}`
      );

      if (statusResponse.data.success && statusResponse.data.booking.paymentStatus === "Completed") {
        console.log("[PhonePe Verify] Already completed, skipping");
        setPaymentProcessing(false);
        toast.success("🎉 Payment already confirmed!");
        navigate(`/ticket?bookingId=${customBookingId}`);
        return;
      }

      toast.info("Verifying payment...");

      const verifyResponse = await axios.post(
        `${import.meta.env.VITE_APP_API_BASE_URL}/api/bookings/verify`,
        {
          orderId: orderId,
          merchantOrderId: merchantOrderId,
          bookingId: customBookingId,
        }
      );

      if (verifyResponse.data.success) {
        setPaymentProcessing(false);
        toast.success("🎉 Payment verified successfully!");
        navigate(`/ticket?bookingId=${customBookingId}`);
      } else {
        setPaymentProcessing(false);
        toast.error(verifyResponse.data.message || "❌ Payment verification failed");
      }
    } catch (error) {
      console.error("[PhonePe Verify] Error:", error);
      setPaymentProcessing(false);
      toast.error(error.response?.data?.message || "Payment verification failed. Please contact support.");
    }
  };

  const handlePayment = async (e) => {
    e.preventDefault();

    // ✅ Validate billing details
    if (
      !billingDetails.email ||
      !billingDetails.firstName ||
      !billingDetails.lastName ||
      !billingDetails.phone ||
      !billingDetails.city
    ) {
      toast.error("Please fill all the details");
      return;
    }

    try {
      console.log("[handlePayment] Creating booking...");

      // ✅ Create booking
      const response = await axios.post(
        `${import.meta.env.VITE_APP_API_BASE_URL}/api/bookings/create`,
        {
          waterpark: resortId,
          waternumber: waternumber,
          waterparkName: resortName,
          name: `${billingDetails.firstName} ${billingDetails.lastName}`,
          email: billingDetails.email,
          phone: billingDetails.phone,
          date: formattedDate,
          adults: adultCount,
          children: childCount,
          total: discountedTotalAmount,
          advanceAmount: finalTotal,
          paymentType: paymentType,
          paymentMethod: paymentMethod,
          terms: terms,
          couponCode: appliedCoupon?.code,
        }
      );

      const { success, redirectUrl, orderId, merchantOrderId, booking } = response.data;

      if (!success) {
        console.error("[handlePayment] Booking creation failed:", response.data.message);
        toast.error("Failed to create booking. Please try again.");
        return;
      }

      console.log("[handlePayment] Booking created:", booking);

      // ✅ Cash Payment
      if (paymentMethod === "cash") {
        toast.success("Booking created successfully with cash payment.");
        console.log("[handlePayment] Redirecting to ticket page for cash booking...");
        navigate(`/ticket?bookingId=${booking.customBookingId}`);
        return;
      }

      // ✅ PhonePe Payment
      if (paymentMethod === "phonepe" && redirectUrl) {
        setCurrentBookingId(booking.customBookingId);
        setPaymentProcessing(true);

        console.log("[handlePayment] Redirecting to PhonePe payment page...");
        console.log("[handlePayment] Redirect URL:", redirectUrl);

        if (window.PhonePeCheckout) {
          window.PhonePeCheckout.transact({
            tokenUrl: redirectUrl,
            type: "IFRAME",
            callback: function (response) {
              console.log("[PhonePeCallback]", response);
              if (response === 'USER_CANCEL') {
                toast.error("Payment was cancelled. Please try again.");
                setPaymentProcessing(false);
                return;
              } else if (response === 'CONCLUDED') {
                window.location.href = `${import.meta.env.VITE_APP_FRONTEND_URL || window.location.origin}/payment/status?orderId=${merchantOrderId}&bookingId=${booking.customBookingId}`;
                return;
              }
            }
          });
        } else {
          // Fallback if PhonePe SDK failed to load
          window.location.href = redirectUrl;
        }
      } else if (paymentMethod === "phonepe") {
        toast.error("Failed to initiate PhonePe payment. Please try again.");
        setPaymentProcessing(false);
      }

      // ✅ Razorpay Payment
      if (paymentMethod === "razorpay" && orderId) {
        setCurrentBookingId(booking.customBookingId);
        setPaymentProcessing(true);

        const options = {
          key: response.data.razorpayKeyId,
          amount: response.data.amount,
          currency: response.data.currency,
          name: resortName || "Water Park Booking",
          description: "Water Park Ticket Booking",
          order_id: response.data.orderId,
          handler: async function (paymentResponse) {
            try {
              toast.info("Verifying payment...");
              const verifyResponse = await axios.post(
                `${import.meta.env.VITE_APP_API_BASE_URL}/api/bookings/verify`,
                {
                  paymentMethod: "razorpay",
                  razorpay_payment_id: paymentResponse.razorpay_payment_id,
                  razorpay_order_id: paymentResponse.razorpay_order_id,
                  razorpay_signature: paymentResponse.razorpay_signature,
                  bookingId: booking.customBookingId,
                }
              );

              if (verifyResponse.data.success) {
                setPaymentProcessing(false);
                toast.success("🎉 Payment verified successfully!");
                navigate(`/ticket?bookingId=${booking.customBookingId}`);
              } else {
                setPaymentProcessing(false);
                toast.error(verifyResponse.data.message || "❌ Payment verification failed");
              }
            } catch (error) {
              console.error("[Razorpay Verify] Error:", error);
              setPaymentProcessing(false);
              toast.error("Payment verification failed. Please contact support.");
            }
          },
          prefill: {
            name: `${billingDetails.firstName} ${billingDetails.lastName}`,
            email: billingDetails.email,
            contact: billingDetails.phone,
          },
          theme: {
            color: "#3b82f6",
          },
        };

        const rzp1 = new window.Razorpay(options);
        rzp1.on("payment.failed", function (failResponse) {
          toast.error("Payment failed. Please try again.");
          setPaymentProcessing(false);
        });
        rzp1.open();
      } else if (paymentMethod === "razorpay") {
        toast.error("Failed to initiate Razorpay payment. Please try again.");
        setPaymentProcessing(false);
      }
    } catch (error) {
      console.error("[handlePayment] Error initiating payment:", error);
      const errMessage = error.response?.data?.message || "Payment initiation failed. Please try again.";
      toast.error(`❌ ${errMessage}`);
      setPaymentProcessing(false);
    }
  };


  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-cyan-200 via-blue-200 to-blue-300 overflow-hidden">
      <AnimatedBubbles />
      {/* Top Wave */}
      <div className="absolute top-0 left-0 w-full">
        {/* SVG remains unchanged */}
      </div>

      {/* Checkout card */}
      <div className="mt-10 mb-10  relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-10 z-10 border-4 border-cyan-300">
        <h1 className="text-4xl font-bold text-blue-700 text-center mb-8">
          🎢 Water Park Checkout 💦
        </h1>

        {/* Important Points */}
        <div className="bg-gradient-to-r from-blue-50 to-blue-50 border-2 border-blue-300 rounded-xl p-4 mb-2 shadow-lg">
          <h3 className="text-sm font-bold text-blue-800 mb-4 flex items-center gap-2">
            ⚠️ Important Points to Remember
          </h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-blue-600 font-bold text-sm">•</span>
              <p className="text-blue-700">
                <strong>Wait for 1-2 seconds</strong> after payment to get your booking confirmed instantly
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-blue-600 font-bold text-sm">•</span>
              <p className="text-blue-700">
                <strong>View your ticket</strong> after payment completion - you'll be redirected automatically
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-blue-600 font-bold text-sm">•</span>
              <p className="text-blue-700">
                <strong>Access anytime</strong> - Your ticket URL works even if you close the browser
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-blue-600 font-bold text-sm">•</span>
              <p className="text-blue-700">
                <strong>Keep your Ticket</strong> safe - you'll need it for entry
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-blue-600 font-bold text-sm">•</span>
              <p className="text-blue-700">
                <strong>Check your email/WhatsApp</strong> for booking confirmation and ticket details directly from waterpark
              </p>
            </div>
          </div>
        </div>

        {/* Payment Processing Status */}
        {paymentProcessing && (
          <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 rounded-xl p-4 mb-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-green-800 mb-1">
                  Processing Your Payment...
                </h3>
                <p className="text-green-700 text-sm">
                  Please wait while we confirm your booking. This usually takes 1-2 seconds with our direct verification system.
                </p>
                {currentBookingId && (
                  <div className="mt-2">
                    <p className="text-green-600 text-xs font-mono">
                      Booking ID: {currentBookingId}
                    </p>
                    <p className="text-green-600 text-xs mt-1">
                      ⚡ Using direct verification for instant confirmation
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <form className="space-y-10">
          {/* Billing Details (Unchanged) */}
          <div>
            <h2 className="text-2xl font-semibold text-cyan-600 mb-4">
              Billing Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {["firstName", "lastName", "phone", "email", "city"].map(
                (field) => (
                  <div key={field} className="flex flex-col">
                    <label
                      htmlFor={field}
                      className="text-gray-700 font-medium mb-2"
                    >
                      {field === "phone"
                        ? "WhatsApp Number (can be used as login)"
                        : field
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (str) => str.toUpperCase())
                      }
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      id={field}
                      type={field === "email" ? "email" : "text"}
                      name={field}
                      value={billingDetails[field]}
                      onChange={handleInputChange}
                      className="px-4 py-2 border border-cyan-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                      required
                    />
                  </div>
                )
              )}
            </div>
          </div>

          {/* START: Coupon Code Section */}
          <div>
            <h2 className="text-2xl font-semibold text-cyan-600 mb-4">
              Have a Coupon?
            </h2>

            {!appliedCoupon ? (
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Enter coupon code"
                  className="flex-grow px-4 py-2 border border-cyan-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  className="bg-cyan-500 text-white px-6 py-2 rounded-lg hover:bg-cyan-600 transition-colors"
                >
                  Apply
                </button>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-green-600 font-semibold">✓ Coupon Applied</span>
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-mono">
                      {appliedCoupon.code}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedCoupon(null);
                      setDiscountAmount(0);
                      setCouponCode("");
                      setCouponError("");
                    }}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    Remove
                  </button>
                </div>


              </div>
            )}

            {couponError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
                <div className="flex items-center gap-2">
                  <span className="text-red-600 font-semibold">✗ Coupon Invalid</span>
                </div>
                <div className="text-sm text-red-700 mt-2">
                  {couponError}
                </div>
              </div>
            )}
          </div>
          {/* END: Coupon Code Section */}

          {/* Order Summary (MODIFIED) */}
          <div>
            <h2 className="text-2xl font-semibold text-cyan-600 mb-4">
              Your Order
            </h2>
            <div className="overflow-x-auto bg-cyan-50 rounded-lg shadow">
              <table className="w-full text-left border-collapse">
                <thead className="bg-cyan-100">
                  <tr>
                    <th className="py-3 px-4 text-blue-700 font-medium">
                      Product
                    </th>
                    <th className="py-3 px-4 text-blue-700 font-medium">
                      Paid
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-3 px-4">
                      {resortName} x 1
                      <br />
                      <span className="text-sm text-gray-500">
                        Check-in: {date} | Adults: {adultCount} | Children:{" "}
                        {childCount}
                      </span>
                    </td>
                    <td className="py-3 px-4">₹{paid}</td>
                  </tr>



                  <tr className="border-b">
                    <td className="py-3 px-4">Total Amount:</td>
                    <td className="py-3 px-4">₹{totalamount}</td>
                  </tr>
                  {discountAmount > 0 && (
                    <tr className="border-b text-green-600">
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-medium">After Discount:</div>
                          <div className="text-xs text-gray-500">Original: ₹{totalamount}</div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-right">
                          <div className="font-semibold">₹{discountedTotalAmount}</div>
                          <div className="text-xs text-gray-500">You saved: ₹{discountAmount}</div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {paymentType === 'advance' && (
                    <tr className="border-b">
                      <td className="py-3 px-4">Remaining to be <br />Paid in Waterpark:</td>
                      <td className="py-3 px-4">₹{remainingAmount}</td>
                    </tr>
                  )}

                  <tr>
                    <td className="py-3 px-4 font-semibold text-cyan-700">
                      {paymentType === 'full' ? 'Payable Total Amount (Full Payment):' : 'Payable Total Amount (Advance):'}
                    </td>
                    <td className="py-3 px-4 font-semibold text-cyan-700">
                      ₹{finalTotal}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment (Unchanged) */}
          <div>
            <h2 className="text-2xl font-semibold text-cyan-600 mb-4">
              Payment Method
            </h2>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="px-4 py-2 border border-cyan-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="razorpay">Razorpay</option>
              {/* <option value="phonepe">PhonePe</option> */}
            </select>
          </div>

          <button
            onClick={handlePayment}
            disabled={paymentProcessing}
            className={`w-full py-3 rounded-xl shadow-lg transform transition duration-300 ${paymentProcessing
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-blue-500 hover:to-cyan-400 hover:scale-105"
              } text-white`}
          >
            {paymentProcessing ? (
              <div className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Processing Payment...
              </div>
            ) : (
              "🌊 Chill & Pay Now"
            )}
          </button>
        </form>
      </div>

      {/* Bottom Wave */}
      <div className="absolute bottom-0 left-0 w-full">
        {/* SVG remains unchanged */}
      </div>
    </div>
  );
}

export default CheckoutPage;