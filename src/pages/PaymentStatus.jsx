import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle,
  Home,
  RefreshCw,
  CreditCard,
  Truck,
  Shield,
  ArrowLeft,
  FileText,
  Waves
} from 'lucide-react';
import paymentService from '../services/paymentService';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import Loader from '../components/Loader';
import AnimatedBubbles from '../components/AnimatedBubbles/AnimatedBubbles';

const PaymentStatus = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null); // 'success', 'failed', 'pending', 'unknown', 'error'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [orderDetails, setOrderDetails] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [bookingVerified, setBookingVerified] = useState(false);
  const [bookingPaymentStatus, setBookingPaymentStatus] = useState(null); // Track booking payment status
  const [bookingData, setBookingData] = useState(null); // Store booking data
  const verifyingRef = useRef(false);

  const orderId = searchParams.get('orderId'); // PhonePe merchantOrderId
  const bookingId = searchParams.get('bookingId'); // customBookingId

  useEffect(() => {
    if (!orderId || !bookingId) {
      setError('No order ID or booking ID provided');
      setLoading(false);
      return;
    }
    checkPaymentStatus();
    // eslint-disable-next-line
  }, [orderId, bookingId, retryCount]);

  // Mark payment as completed immediately when success status is detected
  useEffect(() => {
    if (status === 'success' && !bookingVerified && !verifyingRef.current) {
      verifyingRef.current = true;
      // Immediately mark as completed without verification
      markPaymentCompleted();
    }
    // eslint-disable-next-line
  }, [status]);

  // Redirect to ticket page after successful verification
  useEffect(() => {
    if (status === 'success' && bookingVerified && bookingId) {
      // Small delay to ensure booking is updated in database
      setTimeout(() => {
        navigate(`/ticket?bookingId=${bookingId}`);
      }, 1000);
    }
  }, [status, bookingVerified, bookingId, navigate]);

  const checkPaymentStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // First, get PhonePe payment status using the orderId (merchantOrderId)
      // We need to get the actual PhonePe transaction ID from the booking first
      if (!bookingId) {
        setError('Booking ID is required');
        setLoading(false);
        return;
      }

      // Get booking to find PhonePe orderId (transaction ID)
      try {
        const bookingResponse = await axios.get(
          `${import.meta.env.VITE_APP_API_BASE_URL}/api/bookings/any/${bookingId}`
        );
        
        if (bookingResponse.data.success && bookingResponse.data.booking) {
          const booking = bookingResponse.data.booking;
          const phonePeMerchantOrderId = booking.phonepeMerchantOrderId || orderId;
          
          // Check PhonePe payment status using merchant order ID
          const response = await paymentService.getPhonePeStatus(phonePeMerchantOrderId);
          setStatus(response.status);
          setOrderDetails(response.data?.data || response.data);
        } else {
          setError('Booking not found');
          setStatus('error');
        }
      } catch (bookingError) {
        console.error('Error fetching booking:', bookingError);
        // Try to check payment status directly with orderId
        const response = await paymentService.getPhonePeStatus(orderId);
        setStatus(response.status);
        setOrderDetails(response.data?.data || response.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to check payment status');
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  // Mark payment as completed (no verification needed - payment success page means payment is successful)
  const markPaymentCompleted = async () => {
    try {
      if (!bookingId) {
        toast.error('Missing booking information');
        return;
      }

      // Check if booking has already been marked as completed
      const verifyKey = `booking_completed_${bookingId}`;
      const alreadyCompleted = localStorage.getItem(verifyKey);
      
      if (alreadyCompleted === 'true') {
        setBookingVerified(true);
        setBookingPaymentStatus('Completed');
        // Fetch booking data to display
        try {
          const bookingResponse = await axios.get(
            `${import.meta.env.VITE_APP_API_BASE_URL}/api/bookings/any/${bookingId}`
          );
          if (bookingResponse.data.success && bookingResponse.data.booking) {
            setBookingData(bookingResponse.data.booking);
            setBookingPaymentStatus(bookingResponse.data.booking.paymentStatus);
          }
        } catch (e) {
          console.warn('Could not fetch booking:', e);
        }
        return;
      }

      // Set status immediately to show success
      setBookingPaymentStatus('Completed');
      setBookingVerified(true);
      toast.success('🎉 Payment Successful! Updating booking status...');

      // Mark payment as completed (no verification needed)
      const markResponse = await axios.post(
        `${import.meta.env.VITE_APP_API_BASE_URL}/api/bookings/mark-completed`,
        {
          orderId: orderId,
          merchantOrderId: orderId,
          bookingId: bookingId,
        }
      );

      if (markResponse.data.success) {
        // Mark booking as completed to prevent duplicate updates
        localStorage.setItem(verifyKey, 'true');
        
        // Fetch updated booking to get the latest payment status
        try {
          const updatedBookingResponse = await axios.get(
            `${import.meta.env.VITE_APP_API_BASE_URL}/api/bookings/any/${bookingId}`
          );
          
          if (updatedBookingResponse.data.success && updatedBookingResponse.data.booking) {
            const updatedBooking = updatedBookingResponse.data.booking;
            setBookingData(updatedBooking);
            setBookingPaymentStatus(updatedBooking.paymentStatus);
            console.log('[markPaymentCompleted] ✅ Booking payment status saved as:', updatedBooking.paymentStatus);
          }
        } catch (fetchError) {
          console.warn('[markPaymentCompleted] Could not fetch updated booking:', fetchError);
          // Status already set to Completed above
        }
        
        toast.success('✅ Booking confirmed! Payment status: Completed');
      } else {
        toast.error(markResponse.data.message || 'Failed to mark payment as completed');
        setBookingVerified(false);
      }
    } catch (err) {
      console.error('Error marking payment as completed:', err);
      toast.error(err.response?.data?.message || 'Failed to update booking status. Please contact support.');
      setBookingVerified(false);
    }
  };

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
  };

  const handleGoHome = () => {
    navigate('/');
  };

  const handleGoToTicket = () => {
    if (bookingId) {
      navigate(`/ticket?bookingId=${bookingId}`);
    } else {
      navigate('/');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cyan-500 via-blue-400 to-cyan-300 flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}></div>
        <div className="text-center relative z-10">
          <Loader />
          <p className="mt-4 text-white font-semibold text-lg">Checking payment status...</p>
        </div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cyan-500 via-blue-400 to-cyan-300 flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}></div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 max-w-md w-full mx-4 border border-white/20 relative z-10"
        >
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 ring-4 ring-red-50">
              <AlertCircle size={32} className="text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <div className="space-y-3">
              <button
                onClick={handleRetry}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:from-cyan-700 hover:to-blue-700 transition-all transform hover:scale-105 shadow-lg"
              >
                <RefreshCw size={20} className="inline mr-2" />
                Try Again
              </button>
              <button
                onClick={handleGoHome}
                className="w-full bg-white/80 text-gray-700 px-6 py-3 rounded-xl font-medium hover:bg-white transition-all border border-gray-200"
              >
                <Home size={20} className="inline mr-2" />
                Go Home
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const renderSuccessStatus = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 max-w-2xl w-full mx-4 border border-white/20 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-cyan-200/30 to-blue-200/30 rounded-full -mr-32 -mt-32"></div>
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-cyan-100/30 to-blue-100/30 rounded-full -ml-24 -mb-24"></div>
      <div className="relative z-10">
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-24 h-24 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg ring-4 ring-cyan-100"
          >
            <CheckCircle size={48} className="text-white" />
          </motion.div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent mb-3">Payment Successful!</h1>
          <p className="text-gray-700 mb-4 text-lg">Your booking has been confirmed and payment received.</p>
          <div className="bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-200 rounded-xl p-4 mb-6 shadow-sm">
            <p className="text-cyan-800 text-sm font-medium">
              <Shield size={16} className="inline mr-2" />
              Payment Status: <span className="font-bold text-cyan-700">{bookingPaymentStatus || 'Completed'}</span>
            </p>
            <p className="text-cyan-700 text-xs mt-2">
              ✅ Payment is successful! Booking status: <strong>Completed</strong>
            </p>
          </div>
        </div>

        {orderDetails && (
          <div className="space-y-4 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-xl p-5 border border-cyan-100 shadow-sm">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center">
                  <FileText size={18} className="text-cyan-600 mr-2" />
                  Booking Details
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center pb-2 border-b border-cyan-100">
                    <span className="text-gray-600">Booking ID:</span>
                    <span className="font-bold text-cyan-700">{bookingId || orderDetails.merchantOrderId || orderDetails.orderId}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-cyan-100">
                    <span className="text-gray-600">Amount:</span>
                    <span className="font-bold text-blue-600">₹{(orderDetails.amount / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-cyan-100">
                    <span className="text-gray-600">Payment Method:</span>
                    <span className="font-bold text-cyan-700">{bookingData?.paymentType || 'PhonePe'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Payment Status:</span>
                    <span className="px-3 py-1 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-full text-xs font-semibold">
                      {bookingPaymentStatus || 'Completed'}
                    </span>
                  </div>
                  {bookingData?.paymentId && (
                    <div className="flex justify-between items-center pt-2 border-t border-cyan-100">
                      <span className="text-gray-600">Transaction ID:</span>
                      <span className="font-mono text-xs text-gray-600">{bookingData.paymentId}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-5 border border-blue-100 shadow-sm">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center">
                  <Waves size={18} className="text-blue-600 mr-2" />
                  What's Next?
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center text-gray-700">
                    <Truck size={18} className="text-cyan-500 mr-3" />
                    <span>Your booking is confirmed</span>
                  </div>
                  <div className="flex items-center text-gray-700">
                    <Shield size={18} className="text-blue-500 mr-3" />
                    <span>Secure payment processed successfully</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="text-center">
          <p className="text-gray-600 text-sm mb-6 font-medium">
            {bookingVerified ? '🎉 Payment successful! Redirecting to ticket page...' : '✅ Payment successful! Updating booking...'}
          </p>
          <div className="space-y-3">
            <button
              onClick={handleGoToTicket}
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white px-6 py-4 rounded-xl font-semibold hover:from-cyan-700 hover:to-blue-700 transition-all transform hover:scale-105 shadow-lg flex items-center justify-center"
            >
              <Shield size={20} className="mr-2" />
              View My Ticket
            </button>
            <button
              onClick={handleGoHome}
              className="w-full bg-white/80 text-gray-700 px-6 py-4 rounded-xl font-medium hover:bg-white transition-all border-2 border-gray-200 flex items-center justify-center"
            >
              <Home size={20} className="mr-2" />
              Go Home
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );

  const renderFailedStatus = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 max-w-2xl w-full mx-4 border border-white/20 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-red-100/30 to-orange-100/30 rounded-full -mr-32 -mt-32"></div>
      <div className="relative z-10">
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-24 h-24 bg-gradient-to-br from-red-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg ring-4 ring-red-100"
          >
            <XCircle size={48} className="text-white" />
          </motion.div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent mb-3">Payment Failed</h1>
          <p className="text-gray-700 mb-4 text-lg">Your payment could not be processed. Please try again.</p>
          <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-xl p-4 mb-6 shadow-sm">
            <p className="text-red-800 text-sm font-medium">
              <AlertCircle size={16} className="inline mr-2" />
              No amount has been deducted from your account
            </p>
          </div>
        </div>

        {orderDetails && (
          <div className="space-y-4 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl p-5 border border-red-100 shadow-sm">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center">
                  <FileText size={18} className="text-red-600 mr-2" />
                  Booking Details
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center pb-2 border-b border-red-100">
                    <span className="text-gray-600">Booking ID:</span>
                    <span className="font-bold text-red-700">{bookingId || orderDetails.merchantOrderId || orderDetails.orderId}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-red-100">
                    <span className="text-gray-600">Amount:</span>
                    <span className="font-bold text-orange-600">₹{(orderDetails.amount / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-red-100">
                    <span className="text-gray-600">Status:</span>
                    <span className="px-3 py-1 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-full text-xs font-semibold">Failed</span>
                  </div>
                  {orderDetails.errorCode && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Error Code:</span>
                      <span className="font-bold text-red-600">{orderDetails.errorCode}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-xl p-5 border border-orange-100 shadow-sm">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center">
                  <Waves size={18} className="text-orange-600 mr-2" />
                  What You Can Do
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center text-gray-700">
                    <RefreshCw size={18} className="text-red-500 mr-3" />
                    <span>Try the payment again</span>
                  </div>
                  <div className="flex items-center text-gray-700">
                    <CreditCard size={18} className="text-orange-500 mr-3" />
                    <span>Use a different payment method</span>
                  </div>
                  <div className="flex items-center text-gray-700">
                    <Shield size={18} className="text-red-500 mr-3" />
                    <span>Contact support if issue persists</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="text-center space-y-3">
          <button
            onClick={() => navigate('/checkout')}
            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white px-6 py-4 rounded-xl font-semibold hover:from-cyan-700 hover:to-blue-700 transition-all transform hover:scale-105 shadow-lg flex items-center justify-center"
          >
            <RefreshCw size={20} className="mr-2" />
            Try Payment Again
          </button>
          <button
            onClick={handleGoHome}
            className="w-full bg-white/80 text-gray-700 px-6 py-4 rounded-xl font-medium hover:bg-white transition-all border-2 border-gray-200 flex items-center justify-center"
          >
            <Home size={20} className="mr-2" />
            Go Home
          </button>
        </div>
      </div>
    </motion.div>
  );

  const renderPendingStatus = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 max-w-2xl w-full mx-4 border border-white/20 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-yellow-200/30 to-amber-200/30 rounded-full -mr-32 -mt-32"></div>
      <div className="relative z-10">
        <div className="text-center mb-8">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg ring-4 ring-yellow-100"
          >
            <Clock size={48} className="text-white" />
          </motion.div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-yellow-600 to-amber-600 bg-clip-text text-transparent mb-3">Payment Pending</h1>
          <p className="text-gray-700 mb-4 text-lg">Your payment is being processed. Please wait...</p>
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-4 mb-6 shadow-sm">
            <p className="text-yellow-800 text-sm font-medium">
              <Clock size={16} className="inline mr-2" />
              This may take a few minutes to complete
            </p>
          </div>
        </div>

        {orderDetails && (
          <div className="space-y-4 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl p-5 border border-yellow-100 shadow-sm">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center">
                  <FileText size={18} className="text-yellow-600 mr-2" />
                  Booking Details
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center pb-2 border-b border-yellow-100">
                    <span className="text-gray-600">Booking ID:</span>
                    <span className="font-bold text-yellow-700">{bookingId || orderDetails.merchantOrderId || orderDetails.orderId}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-yellow-100">
                    <span className="text-gray-600">Amount:</span>
                    <span className="font-bold text-amber-600">₹{(orderDetails.amount / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Status:</span>
                    <span className="px-3 py-1 bg-gradient-to-r from-yellow-500 to-amber-500 text-white rounded-full text-xs font-semibold">Pending</span>
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl p-5 border border-amber-100 shadow-sm">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center">
                  <Waves size={18} className="text-amber-600 mr-2" />
                  What's Happening
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center text-gray-700">
                    <RefreshCw size={18} className="text-yellow-500 mr-3" />
                    <span>Payment is being verified</span>
                  </div>
                  <div className="flex items-center text-gray-700">
                    <Shield size={18} className="text-amber-500 mr-3" />
                    <span>Your money is safe</span>
                  </div>
                  <div className="flex items-center text-gray-700">
                    <Clock size={18} className="text-yellow-500 mr-3" />
                    <span>Please wait for confirmation</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="text-center space-y-3">
          <button
            onClick={handleRetry}
            disabled={retryCount >= 3}
            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white px-6 py-4 rounded-xl font-semibold hover:from-cyan-700 hover:to-blue-700 transition-all transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center"
          >
            <RefreshCw size={20} className="mr-2" />
            Check Status Again ({3 - retryCount} attempts left)
          </button>
          <button
            onClick={handleGoHome}
            className="w-full bg-white/80 text-gray-700 px-6 py-4 rounded-xl font-medium hover:bg-white transition-all border-2 border-gray-200 flex items-center justify-center"
          >
            <Home size={20} className="mr-2" />
            Go Home
          </button>
        </div>
      </div>
    </motion.div>
  );

  const renderUnknownStatus = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 max-w-2xl w-full mx-4 border border-white/20 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-gray-200/30 to-slate-200/30 rounded-full -mr-32 -mt-32"></div>
      <div className="relative z-10">
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-24 h-24 bg-gradient-to-br from-gray-400 to-slate-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg ring-4 ring-gray-100"
          >
            <AlertCircle size={48} className="text-white" />
          </motion.div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-600 to-slate-600 bg-clip-text text-transparent mb-3">Unknown Payment Status</h1>
          <p className="text-gray-700 mb-4 text-lg">We couldn't determine the payment status. Please try again or contact support.</p>
        </div>
        <div className="text-center space-y-3">
          <button
            onClick={handleRetry}
            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white px-6 py-4 rounded-xl font-semibold hover:from-cyan-700 hover:to-blue-700 transition-all transform hover:scale-105 shadow-lg flex items-center justify-center"
          >
            <RefreshCw size={20} className="mr-2" />
            Try Again
          </button>
          <button
            onClick={handleGoHome}
            className="w-full bg-white/80 text-gray-700 px-6 py-4 rounded-xl font-medium hover:bg-white transition-all border-2 border-gray-200 flex items-center justify-center"
          >
            <Home size={20} className="mr-2" />
            Go Home
          </button>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-500 via-blue-400 to-cyan-300 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }}></div>
      <AnimatedBubbles />
      <AnimatePresence mode="wait">
        {status === 'success' && renderSuccessStatus()}
        {status === 'failed' && renderFailedStatus()}
        {status === 'pending' && renderPendingStatus()}
        {status === 'unknown' && renderUnknownStatus()}
      </AnimatePresence>
    </div>
  );
};

export default PaymentStatus; 