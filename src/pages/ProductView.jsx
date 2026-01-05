import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CustomCalendar from './CalendarWithPricing';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Video, MapPin } from "lucide-react";
import {
  ShareIcon, StarIcon, ChevronLeftIcon, ChevronRightIcon, XMarkIcon,
  DocumentTextIcon, CogIcon, TruckIcon, ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';
import MostLoved from '../components/Products/MostLoved';
import WeeklyBestsellers from '../components/Products/WeeklyBestsellers';
import { useAuth } from '../context/AuthContext';
import config from '../config/config.js';
import { toast } from 'react-hot-toast';
import Loader from '../components/Loader';
import ReviewForm from '../components/ReviewForm';
import ReviewList from '../components/ReviewList';
import ReviewService from '../services/reviewService';
import SEO from '../components/SEO/SEO';
import { seoConfig } from '../config/seo';
import WhatsAppButton from '../components/Whatsapp.jsx';
import { getEffectivePrice, hasSpecialPricing, calculateTicketTotal } from '../utils/priceUtils';
import AnimatedBubbles from '../components/AnimatedBubbles/AnimatedBubbles';
import { extractProductSlugFromUrl } from '../utils/urlUtils';

import { Link } from 'react-router-dom';


const ProductView = () => {
  const { idOrSlug } = useParams();
  const navigate = useNavigate();

  // Extract the product slug from the URL parameter
  const productSlug = extractProductSlugFromUrl(idOrSlug);
  const bookingSectionRef = useRef(null);

  // State for UI and product data
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedDate, setSelectedDate] = useState('');
  const [adultquantity, setadultQuantity] = useState(1);
  const [childquantity, setchildQuantity] = useState(0);
  const [activeTab, setActiveTab] = useState('description');
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State for modals
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [modalSelectedImage, setModalSelectedImage] = useState(0);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

  // State for reviews
  const [reviews, setReviews] = useState([]);
  const [userReview, setUserReview] = useState(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [isEditingReview, setIsEditingReview] = useState(false);
  const { user } = useAuth();

  // State for dynamic pricing
  const [weekendSetting, setWeekendSetting] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [grandTotal, setGrandTotal] = useState(0);
  const [advanceTotal, setAdvanceTotal] = useState(0);
  const [isSpecialDay, setIsSpecialDay] = useState(false);


  const tabs = [
    { id: 'description', label: 'Specifications', icon: DocumentTextIcon },
    { id: 'specifications', label: 'Description', icon: CogIcon },
    { id: 'FAQ', label: 'FAQ', icon: TruckIcon },
    { id: 'reviews', label: 'Reviews', icon: ChatBubbleLeftRightIcon },
    { id: 'video', label: 'Video', icon: Video },
    { id: 'map', label: 'Map', icon: MapPin },
  ];

  // --- DATA FETCHING HOOKS ---
  useEffect(() => {
    const fetchPricingSettings = async () => {
      try {
        setLoadingSettings(true);
        const apiUrl = `${config.API_URLS.SETTINGS}`;
        const response = await fetch(apiUrl);
        const contentType = response.headers.get("content-type");
        if (!response.ok || !contentType || !contentType.includes("application/json")) {
          throw new Error("Invalid response from server. Expected JSON.");
        }
        const data = await response.json();
        if (data.success) {
          const setting = data.settings.find(s => s.key === 'weekend_pricing');
          setWeekendSetting(setting);
        } else {
          throw new Error(data.message || "Failed to get settings.");
        }
      } catch (error) {
        console.error("Failed to fetch pricing settings:", error);
        toast.error("Could not load pricing rules.");
      } finally {
        setLoadingSettings(false);
      }
    };
    fetchPricingSettings();
  }, []);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        setError(null);

        // Convert slug back to a searchable format
        const searchName = productSlug.replace(/-/g, ' ').toLowerCase();

        // Fetch from all endpoints to search for products
        const endpoints = [
          config.API_URLS.SHOP,
          config.API_URLS.PRODUCTS,
          config.API_URLS.LOVED,
          config.API_URLS.BESTSELLER,
          config.API_URLS.FEATURED_PRODUCTS
        ];

        let foundProduct = null;

        for (const endpoint of endpoints) {
          try {
            const response = await fetch(endpoint);
            if (!response.ok) continue;

            const data = await response.json();
            const products = data.products || data || [];

            // Search for product by name (case-insensitive)
            const matchingProduct = products.find(p => {
              if (!p.name) return false;
              const productName = p.name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
              return productName.includes(searchName) || searchName.includes(productName);
            });

            if (matchingProduct) {
              foundProduct = {
                ...matchingProduct,
                id: matchingProduct._id || matchingProduct.id,
                price: parseFloat(matchingProduct.price) || 0,
                regularprice: parseFloat(matchingProduct.regularprice) || 0,
                adultprice: parseFloat(matchingProduct.adultprice) || 0,
                childprice: parseFloat(matchingProduct.childprice) || 0,
                weekendprice: parseFloat(matchingProduct.weekendprice) || 0,
                advanceprice: parseFloat(matchingProduct.advanceprice) || 0,
                weekendadvance: parseFloat(matchingProduct.weekendadvance) || 0,
                images: matchingProduct.images || [matchingProduct.image],
              };
              break;
            }
          } catch (error) {
            console.error(`Error fetching from ${endpoint}:`, error);
          }
        }

        if (!foundProduct) {
          throw new Error('waterpark not found');
        }

        setProduct(foundProduct);
      } catch (error) {
        setError(error.message || 'Failed to load waterpark details');
        toast.error('Failed to load waterpark details');
      } finally {
        setLoading(false);
      }
    };

    if (productSlug) {
      fetchProduct();
    }
  }, [productSlug]);

  const loadReviews = async () => {
    if (!product?._id) return;
    setReviewsLoading(true);
    try {
      const reviewsData = await ReviewService.getProductReviews(product._id);
      setReviews(reviewsData.reviews || []);
      if (user?.email) {
        const userReviewData = await ReviewService.getUserReview(product._id, user.email).catch(() => null);
        setUserReview(userReviewData);
      } else {
        setUserReview(null);
      }
    } catch (error) {
      toast.error('Failed to load waterpark reviews');
    } finally {
      setReviewsLoading(false);
    }
  };

  useEffect(() => {
    if (product?._id) loadReviews();
  }, [product?._id, user?.email]);

  // Helper function to get display price (matches calculation logic)
  const getDisplayPrice = (product, priceType, selectedDate, isSpecialDay) => {
    if (!product || !selectedDate) return product?.[priceType] || 0;

    // Check if special pricing exists for this date
    const dateStr = typeof selectedDate === 'string' ? selectedDate : new Date(selectedDate).toISOString().split('T')[0];
    const hasSpecialPricing = product.specialPrices?.[dateStr] && Object.keys(product.specialPrices[dateStr]).length > 0;

    if (hasSpecialPricing) {
      // Use special pricing if available (overrides weekend/regular pricing)
      return getEffectivePrice(product, priceType, selectedDate);
    } else if (isSpecialDay) {
      // Use weekend pricing if no special pricing
      const weekendPriceType = priceType === 'adultprice' ? 'weekendprice' :
        priceType === 'childprice' ? 'price' :
          priceType === 'advanceprice' ? 'weekendadvance' : priceType;
      return getEffectivePrice(product, weekendPriceType, selectedDate) || getEffectivePrice(product, priceType, selectedDate);
    } else {
      // Use regular pricing
      return getEffectivePrice(product, priceType, selectedDate);
    }
  };

  // --- DYNAMIC PRICE CALCULATION HOOK ---
  useEffect(() => {
    if (!product || loadingSettings) return;

    const checkIsSpecialDay = () => {
      if (!selectedDate) return false;

      // Check if weekend pricing is enabled in settings
      if (weekendSetting && weekendSetting.value.status) {
        // Check if this date is manually selected as a special day
        const isManuallySelected = (weekendSetting.value.dates || []).some(dbDateString =>
          new Date(dbDateString).toDateString() === new Date(selectedDate).toDateString()
        );
        if (isManuallySelected) return true;
      }

      // Check if it's automatically a weekend day (Saturday = 6, Sunday = 0)
      const selectedDateObj = new Date(selectedDate);
      const dayOfWeek = selectedDateObj.getDay();
      const isWeekendDay = dayOfWeek === 0; // Sunday or Saturday

      return isWeekendDay;
    };

    const isSpecial = checkIsSpecialDay();
    setIsSpecialDay(isSpecial);

    // Calculate totals using utility function
    const { grandTotal: calculatedGrandTotal, advanceTotal: calculatedAdvanceTotal } = calculateTicketTotal(
      product,
      adultquantity,
      childquantity,
      selectedDate,
      isSpecial
    );

    setGrandTotal(calculatedGrandTotal);
    setAdvanceTotal(calculatedAdvanceTotal);
  }, [selectedDate, adultquantity, childquantity, product, weekendSetting, loadingSettings]);


  // --- ALL HANDLER FUNCTIONS ---
  const handleOpenTermsModal = () => {
    if (!selectedDate) return toast.error("Please select a date for your booking.");
    if (adultquantity === 0 && childquantity === 0) return toast.error("Please add at least one ticket.");
    setIsTermsModalOpen(true);
  };

  const handleProceedToCheckout = () => {
    setIsTermsModalOpen(false);
    const checkoutData = {
      resortId: product._id, resortName: product.name,
      adultCount: adultquantity, childCount: childquantity,
      date: selectedDate, paid: advanceTotal,
      totalamount: grandTotal, waternumber: product.waternumber,
      terms: product.terms,
      paymentType: product.paymentType || 'advance'
    };
    try {
      localStorage.setItem('checkoutData', JSON.stringify(checkoutData));
      navigate('/checkout', { state: checkoutData });
    } catch (error) {
      toast.error("An error occurred. Please try again.");
    }
  };

  const scrollToBooking = () => bookingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const handleadultQuantityChange = (value) => setadultQuantity(Math.max(0, value));
  const handlechildQuantityChange = (value) => setchildQuantity(Math.max(0, value));
  const handleReviewSubmitted = (newReview) => {
    setReviews(prev => [newReview, ...prev.filter(r => r.userEmail !== newReview.userEmail)]);
    setUserReview(newReview);
  };
  const handleReviewUpdated = (updatedReview) => {
    setReviews(prev => prev.map(r => r._id === updatedReview._id ? updatedReview : r));
    setUserReview(updatedReview);
  };
  const handleReviewDeleted = () => { setUserReview(null); loadReviews(); };
  const handlePreviousImage = () => setSelectedImage((prev) => (prev === 0 ? productImages.length - 1 : prev - 1));
  const handleNextImage = () => setSelectedImage((prev) => (prev === productImages.length - 1 ? 0 : prev + 1));
  const handleShare = () => setIsShareModalOpen(true);
  const handleShareOption = async (option) => {
    const shareData = { title: product.name, text: `Check out: ${product.name}`, url: window.location.href };
    try {
      let url;
      switch (option) {
        case 'native': if (navigator.share) await navigator.share(shareData); else { await navigator.clipboard.writeText(shareData.url); toast.success('Link copied!'); } break;
        case 'whatsapp': url = `https://wa.me/?text=${encodeURIComponent(`${shareData.text} ${shareData.url}`)}`; window.open(url, '_blank'); break;
        case 'facebook': url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareData.url)}`; window.open(url, '_blank'); break;
        case 'twitter': url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareData.text)}&url=${encodeURIComponent(shareData.url)}`; window.open(url, '_blank'); break;
        case 'copy': await navigator.clipboard.writeText(shareData.url); toast.success('Link copied!'); break;
        default: break;
      }
      setIsShareModalOpen(false);
    } catch (error) { toast.error('Failed to share'); setIsShareModalOpen(false); }
  };
  const handleImageClick = () => { setModalSelectedImage(selectedImage); setIsImageModalOpen(true); };
  const handleModalPreviousImage = () => setModalSelectedImage((prev) => (prev === 0 ? productImages.length - 1 : prev - 1));
  const handleModalNextImage = () => setModalSelectedImage((prev) => (prev === productImages.length - 1 ? 0 : prev + 1));
  const handleModalClose = () => setIsImageModalOpen(false);

  // --- RENDER LOGIC ---
  if (loading || loadingSettings) return <Loader fullScreen={true} withHeaderFooter={true} size="large" text="Loading waterpark details..." />;
  if (error) return (<div className="flex flex-col items-center justify-center min-h-[60vh] text-center"><h2 className="text-2xl font-bold text-red-600 mb-2">{error}</h2><button onClick={() => navigate('/shop')} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Back to waterpark</button></div>);
  if (!product) return null;

  const productSEO = seoConfig.product(product);
  const productImages = (() => {
    if (product.images?.length > 0) {
      const validImages = product.images.filter(img => typeof img === 'string' && /\.(jpg|jpeg|png|gif|webp)$/i.test(img)).map(img => config.fixImageUrl(img));
      if (validImages.length > 0) return validImages;
    }
    return [config.fixImageUrl(product.image)];
  })();
  const averageRating = reviews.length > 0 ? reviews.reduce((acc, r) => acc + r.stars, 0) / reviews.length : 0;
  const isOutOfStock = product.outOfStock === true || product.inStock === false;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className=" w-full h-full bg-[#00B4D8] overflow-hidden">
      <AnimatedBubbles />
      <SEO {...productSEO} />
      <div className="container mx-auto px-4 py-4 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 items-start">

          {/* --- LEFT COLUMN: IMAGE GALLERY --- */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }} className="lg:col-span-5 space-y-4 flex flex-col">
            <div className="relative w-full flex items-center justify-center rounded-2xl overflow-hidden bg-gradient-to-br from-[#CAF0F8] via-[#ADE8F4] to-[#90E0EF] group shadow-xl border border-[#0077B6]/20" style={{ maxHeight: '60vh' }}>
              <img src={productImages[selectedImage]} alt={product.name} className="max-w-full max-h-[60vh] object-cover cursor-pointer" onClick={handleImageClick} />
              {productImages.length > 1 && (
                <>
                  <div className="absolute top-3 right-3 bg-[#03045E]/70 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-semibold shadow-lg">📷 {productImages.length} Photos</div>
                  <motion.button whileHover={{ x: -5, scale: 1.1 }} className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-[#90E0EF] text-[#0077B6] p-3 rounded-full shadow-lg border-2 border-[#0077B6]/30 transition-all" onClick={handlePreviousImage}><ChevronLeftIcon className="h-6 w-6" /></motion.button>
                  <motion.button whileHover={{ x: 5, scale: 1.1 }} className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-[#90E0EF] text-[#0077B6] p-3 rounded-full shadow-lg border-2 border-[#0077B6]/30 transition-all" onClick={handleNextImage}><ChevronRightIcon className="h-6 w-6" /></motion.button>
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="absolute bottom-3 left-1/6 -translate-x-1/2 bg-[#023E8A]/80 text-white px-3 py-1 rounded-full text-xs font-semibold shadow-md">{selectedImage + 1} / {productImages.length}</motion.div>
                </>
              )}
            </div>
            {productImages.length > 1 && (
              <div className="hidden md:grid grid-cols-4 gap-3">
                {productImages.map((image, index) => (
                  <motion.button key={index} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setSelectedImage(index)} className={`aspect-square rounded-xl overflow-hidden border-2 transition-all relative shadow-sm ${selectedImage === index ? 'border-[#0077B6] shadow-lg' : 'border-transparent hover:border-[#0077B6]/30'}`}>
                    <img src={image} alt={`${product.name} - Image ${index + 1}`} className="w-full h-full object-cover bg-white" />
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>

          {/* --- RIGHT COLUMN: PRODUCT DETAILS --- */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="lg:col-span-7 space-y-6 flex flex-col justify-start bg-gradient-to-br from-[#E0F7FA] to-[#B2EBF2] p-6 rounded-2xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-24 bg-[#00B4D8] rounded-b-[50%] opacity-20 pointer-events-none"></div>

            {/* Product Header */}
            <div className="space-y-3 relative z-10">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <MapPin size={14} className="text-blue-800" />
                <span className="px-2 py-1 bg-[#CAF0F8] text-[#023E8A] text-xs font-medium rounded-full">{product.category}</span>
              </div>
              <h1 className="text-2xl font-bold text-[#03045E] leading-tight">{product.name}</h1>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, index) => (<StarIcon key={index} className={`h-4 w-4 ${index < Math.floor(averageRating) ? 'text-yellow-400' : 'text-gray-300'}`} />))}
                  <span className="text-xs text-gray-600">{averageRating > 0 ? `${averageRating.toFixed(1)} (${reviews.length} reviews)` : 'No reviews yet'}</span>
                </div>
              </div>
            </div>

            {/* Price Section */}
            <div className="space-y-2 sm:space-y-3">
              {/* Weekend Pricing Notice */}


              <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
                <span className="text-2xl sm:text-3xl font-bold text-blue-900">
                  ₹{getDisplayPrice(product, 'adultprice', selectedDate, isSpecialDay).toFixed(2)}
                </span>
                {product.regularprice && product.regularprice > getDisplayPrice(product, 'adultprice', selectedDate, isSpecialDay) && (
                  <>
                    <span className="text-lg sm:text-xl text-gray-400 line-through">₹{product.regularprice.toFixed(2)}</span>
                    <span className="px-2 py-1 bg-red-100 text-red-600 text-xs font-medium rounded-full">
                      {Math.round(((product.regularprice - getDisplayPrice(product, 'adultprice', selectedDate, isSpecialDay)) / product.regularprice) * 100)}% OFF
                    </span>
                  </>
                )}

                {getDisplayPrice(product, 'adultprice', selectedDate, isSpecialDay) !== product.adultprice && !isSpecialDay && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-600 text-xs font-medium rounded-full">
                    Special Price
                  </span>
                )}
              </div>
              <p className="text-lg font-semibold text-blue-600 tracking-wide">{product.sd}</p>
              <WhatsAppButton phoneNumber="+918847714464" product={product} />
            </div>

            {/* Tabs Section */}
            <div className="mt-10 font-['Baloo_2']">
              <div className="border-b-2 border-blue-200">
                <nav className="flex space-x-1 sm:space-x-1 overflow-x-auto pb-1">
                  {tabs.map((tab) => (
                    <motion.button key={tab.id} onClick={() => setActiveTab(tab.id)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className={`relative whitespace-nowrap py-2 px-3 text-sm sm:py-3 sm:px-4 sm:text-lg rounded-t-xl font-semibold transition-all duration-300 ${activeTab === tab.id ? "bg-gradient-to-r from-[#00B4D8] to-[#0077B6] text-white shadow-md" : "text-gray-500 hover:text-blue-600 hover:bg-blue-50"}`}>
                      {tab.label}
                      {activeTab === tab.id && (<motion.div layoutId="tab-underline" className="absolute left-0 right-0 -bottom-[2px] h-1 bg-[#90E0EF] rounded-full" />)}
                    </motion.button>
                  ))}
                </nav>
              </div>
            </div>

            <div className="py-8">
              <AnimatePresence mode="wait">
                {activeTab === 'description' && (
                  <motion.div
                    key="description"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-8"
                  >
                    {/* Features Panel */}
                    <div className="p-6 rounded-3xl bg-white/60 backdrop-blur-lg border border-sky-200/50 shadow-2xl shadow-sky-900/10">
                      <h4 className="font-display font-bold text-sky-900 mb-4 text-xl flex items-center gap-2">
                        💡 Features
                      </h4>
                      <div className="space-y-3 font-sans text-sky-800 leading-relaxed">
                        {product.utility ? product.utility.split(/\r?\n/).map((line, index) => (
                          <p key={index} className="font-medium">{line.trim()}</p>
                        )) : <p>N/A</p>}
                      </div>
                    </div>
                    {/* Facility Panel */}
                    <div className="p-6 rounded-3xl bg-white/60 backdrop-blur-lg border border-sky-200/50 shadow-2xl shadow-sky-900/10">
                      <h4 className="font-display font-bold text-sky-900 mb-4 text-xl flex items-center gap-2">
                        🏝️ Facility
                      </h4>
                      <p className="font-sans text-sky-800 whitespace-pre-line leading-relaxed">
                        {product.care || 'Facility information not available'}
                      </p>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'specifications' && (
                  <motion.div
                    key="specifications"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-8"
                  >
                    {/* Basic Info Panel */}
                    <div className="p-6 rounded-3xl bg-white/60 backdrop-blur-lg border border-sky-200/50 shadow-2xl shadow-sky-900/10">
                      <h4 className="font-display font-bold text-sky-900 mb-4 text-xl flex items-center gap-2">
                        ℹ️ Basic Information
                      </h4>
                      <div className="space-y-4">
                        <div>
                          <h5 className="font-display text-lg font-bold mb-2 text-sky-900">Description</h5>
                          <div
                            className="font-sans text-sky-800 leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: product.description || '' }}
                          />
                        </div>
                        <div>
                          <h5 className="font-display text-lg font-bold mb-2 text-sky-900">Location</h5>
                          <p className="font-sans text-sky-800 leading-relaxed">{product.category}</p>
                        </div>
                      </div>
                    </div>

                    {/* Pricing Panel */}
                    <div className="p-6 rounded-3xl bg-white/60 backdrop-blur-lg border border-sky-200/50 shadow-2xl shadow-sky-900/10">
                      <h4 className="font-display font-bold text-sky-900 mb-4 text-xl flex items-center gap-2">
                        💵 Pricing
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                          <span className="font-sans text-sm font-medium text-sky-700">Adult Ticket</span>
                          <p className="font-display font-bold text-3xl text-cyan-600 mt-1">
                            ₹{getDisplayPrice(product, 'adultprice', selectedDate, isSpecialDay)?.toFixed(0) || 'N/A'}
                          </p>
                          {getDisplayPrice(product, 'adultprice', selectedDate, isSpecialDay) !== product.adultprice && !isSpecialDay && (
                            <p className="text-xs text-blue-600 font-medium">Special Price</p>
                          )}

                        </div>
                        <div>
                          <span className="font-sans text-sm font-medium text-sky-700">Child Ticket</span>
                          <p className="font-display font-bold text-3xl text-cyan-600 mt-1">
                            ₹{getDisplayPrice(product, 'childprice', selectedDate, isSpecialDay)?.toFixed(0) || 'N/A'}
                          </p>
                          {getDisplayPrice(product, 'childprice', selectedDate, isSpecialDay) !== product.childprice && !isSpecialDay && (
                            <p className="text-xs text-blue-600 font-medium">Special Price</p>
                          )}

                        </div>
                        <div>
                          <span className="font-sans text-sm font-medium text-sky-700">Advance Payment</span>
                          <p className="font-display font-bold text-3xl text-cyan-600 mt-1">
                            ₹{getDisplayPrice(product, 'advanceprice', selectedDate, isSpecialDay)?.toFixed(0) || 'N/A'}
                          </p>

                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'FAQ' && (
                  <motion.div
                    key="FAQ"
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}
                    className="p-6 rounded-3xl bg-white/60 backdrop-blur-lg border border-sky-200/50 shadow-2xl shadow-sky-900/10 font-sans text-sky-800 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: product.faq?.replace(/\n/g, "<br/>") }}
                  />
                )}

                {activeTab === 'video' && (
                  <motion.div key="video" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
                    {product.videos?.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {product.videos.map((videoUrl, index) => (
                          <div key={index} className="rounded-2xl overflow-hidden shadow-xl">
                            <video src={videoUrl} controls className="w-full h-auto" preload="metadata" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="font-sans text-center p-8">No videos available.</p>
                    )}
                  </motion.div>
                )}

                {activeTab === 'map' && (
                  <motion.div key="map" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
                    <iframe
                      title="map"
                      src={product.maplink}
                      width="100%"
                      height="450"
                      className="border-0 rounded-2xl shadow-xl"
                      allowFullScreen=""
                      loading="lazy">
                    </iframe>
                  </motion.div>
                )}

                {activeTab === 'reviews' && (
                  <motion.div
                    key="reviews"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-8"
                  >
                    {reviewsLoading ? <p>Loading reviews...</p> : (
                      <>
                        <ReviewForm productId={product._id} existingReview={userReview} onReviewSubmitted={handleReviewSubmitted} onReviewUpdated={handleReviewUpdated} onReviewDeleted={handleReviewDeleted} />
                        <ReviewList reviews={reviews} />
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Booking Section */}
            <div ref={bookingSectionRef} className="space-y-6 pt-4 border-t-2 border-dashed border-[#0096C7]">
              <div className=" relative z-5">
                <CustomCalendar
                  selectedDate={selectedDate}
                  onDateChange={(d) => setSelectedDate(d)}
                  normalPrice={product.adultprice}
                  weekendPrice={product.weekendprice}
                  specialDates={weekendSetting?.value?.dates || []}
                  isPricingActive={weekendSetting?.value?.status || false}
                  product={product}
                />
              </div>
              <div className="flex flex-wrap items-center  justify-center gap-10">
                <div className="flex items-center gap-4">
                  {/* Adult Stepper */}
                  <div className="flex items-center gap-1.5">
                    <label className="text-sm font-medium text-gray-700">Adult:</label>
                    <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden bg-white">
                      <button onClick={() => handleadultQuantityChange(adultquantity - 1)} className="px-2.5 py-1 hover:bg-[#CAF0F8] transition-colors disabled:opacity-50" disabled={adultquantity <= 0}>-</button>
                      <span className="px-3 py-1 border-x border-gray-300 text-sm font-semibold text-[#03045E]">{adultquantity}</span>
                      <button onClick={() => handleadultQuantityChange(adultquantity + 1)} className="px-2.5 py-1 hover:bg-[#CAF0F8] transition-colors">+</button>
                    </div>
                  </div>

                  {/* Child Stepper */}
                  <div className="flex items-center gap-1.5">
                    <label className="text-sm font-medium text-gray-700">Child:</label>
                    <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden bg-white">
                      <button onClick={() => handlechildQuantityChange(childquantity - 1)} className="px-2.5 py-1 hover:bg-[#CAF0F8] transition-colors disabled:opacity-50" disabled={childquantity <= 0}>-</button>
                      <span className="px-3 py-1 border-x border-gray-300 text-sm font-semibold text-[#03045E]">{childquantity}</span>
                      <button onClick={() => handlechildQuantityChange(childquantity + 1)} className="px-2.5 py-1 hover:bg-[#CAF0F8] transition-colors">+</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ticket Summary Table */}
              <div className="w-full flex justify-center relative z-5">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-lg bg-gradient-to-br from-[#00B4D8] via-[#0096C7] to-[#0077B6] rounded-2xl shadow-xl overflow-hidden">
                  <div className="bg-[#023E8A] text-white text-center py-3 text-lg font-bold tracking-wide flex items-center justify-center gap-2">🎟️ Ticket Summary</div>
                  <table className="w-full text-sm text-white">
                    <thead className="bg-[#03045E]/80"><tr><th className="px-4 py-3 text-left">Ticket Type</th><th className="px-4 py-3 text-center">Qty</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">Total</th></tr></thead>
                    <tbody>
                      <motion.tr className="border-t border-white/30 hover:bg-white/10 transition">
                        <td className="px-4 py-3 font-medium">
                          Adult above 8 year

                        </td>
                        <td className="px-4 py-3 text-center">{adultquantity}</td>
                        <td className="px-4 py-3 text-right">
                          ₹{getDisplayPrice(product, 'adultprice', selectedDate, isSpecialDay)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          ₹{adultquantity * getDisplayPrice(product, 'adultprice', selectedDate, isSpecialDay)}
                        </td>
                      </motion.tr>
                      <motion.tr className="border-t border-white/30 hover:bg-white/10 transition">
                        <td className="px-4 py-3 font-medium">
                          Child 3 to 8 year

                        </td>
                        <td className="px-4 py-3 text-center">{childquantity}</td>
                        <td className="px-4 py-3 text-right">
                          ₹{getDisplayPrice(product, 'childprice', selectedDate, isSpecialDay)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          ₹{childquantity * getDisplayPrice(product, 'childprice', selectedDate, isSpecialDay)}
                        </td>
                      </motion.tr>
                    </tbody>
                    <tfoot><motion.tr className="bg-[#48CAE4] text-[#03045E] font-bold text-base"><td className="px-4 py-3 text-left" colSpan={3}>💰 Grand Total</td><td className="px-4 py-3 text-right">₹{grandTotal.toFixed(2)}</td></motion.tr></tfoot>
                  </table>
                  <table className="w-full text-sm text-white ">
                    <tbody>
                      {product.paymentType === 'full' ? (
                        <motion.tr className=" bg-[#48CAE4] text-[#03045E] font-bold "><td className="px-4 py-3 font-bold text-left" colSpan={3}>💰 Pay Now (Full Payment)</td><td className="px-4 py-3 text-right">₹{advanceTotal.toFixed(2)}</td></motion.tr>
                      ) : (
                        <>
                          <motion.tr className=" bg-[#48CAE4] text-[#03045E] font-bold "><td className="px-4 py-3 font-bold text-left" colSpan={3}>💰 Pay Now (Advance)</td><td className="px-4 py-3 text-right">₹{advanceTotal.toFixed(2)}</td></motion.tr>
                          <motion.tr className=" bg-[#48CAE4] text-[#03045E] font-bold transition"><td className="px-4 py-3 font-bold" colSpan={3}>💰 Pay In Waterpark</td><td className="px-4 py-3 text-right">₹{(grandTotal - advanceTotal).toFixed(2)}</td></motion.tr>
                        </>
                      )}
                    </tbody>
                  </table>


                </motion.div>
              </div>
              {/* Action Buttons */}
              <div className="flex items-center gap-4">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleOpenTermsModal} disabled={isOutOfStock} className={`w-full flex items-center justify-center gap-3 px-6 py-4 rounded-full font-bold text-lg transition-all shadow-lg ${isOutOfStock ? 'bg-gray-400 text-gray-600 cursor-not-allowed' : 'bg-gradient-to-r from-[#00B4D8] to-[#0077B6] text-white hover:shadow-xl'}`}>{isOutOfStock ? 'CURRENTLY UNAVAILABLE' : 'BOOK NOW'}</motion.button>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className=" p-4 bg-white border border-gray-300 rounded-full hover:bg-[#CAF0F8] transition-colors shadow-md" onClick={handleShare}><ShareIcon className="h-5 w-5 text-gray-600" /></motion.button>
              </div>

            </div>
          </motion.div>
        </div>

        {/* Related Products Sections */}
        <div className="mt-8">
          <MostLoved />
          <WeeklyBestsellers />
        </div>
      </div>

      {/* Floating Book Now Button */}
      <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5, type: 'spring', stiffness: 100 }} className="fixed bottom-20 left-6 md:bottom-6 md:left-6 z-[400]">
        <button onClick={scrollToBooking} className="flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-[#03045E] to-[#0077B6] text-white font-bold text-lg rounded-full shadow-2xl hover:shadow-blue-400/50 transition-all duration-300 transform hover:-translate-y-1">
          <span>Book Now</span>
        </button>
      </motion.div>

      {/* --- ALL MODALS --- */}
      <AnimatePresence>
        {isImageModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleModalClose}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="relative max-w-7xl max-h-full" onClick={(e) => e.stopPropagation()}>
              <button onClick={handleModalClose} className="absolute top-4 right-4 z-10 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white p-3 rounded-full transition-all duration-200"><XMarkIcon className="h-6 w-6" /></button>
              <div className="relative w-full flex items-center justify-center" style={{ maxHeight: '90vh' }}>
                <img src={productImages[modalSelectedImage]} alt={`${product.name} - Full size view`} className="max-w-full max-h-[90vh] object-contain rounded-lg" />
                {productImages.length > 1 && (
                  <>
                    <button onClick={handleModalPreviousImage} className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm hover:bg-white text-[#0077B6] p-4 rounded-full transition-all duration-200 shadow-lg border-2 border-[#0077B6]/30"><ChevronLeftIcon className="h-8 w-8" /></button>
                    <button onClick={handleModalNextImage} className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm hover:bg-white text-[#0077B6] p-4 rounded-full transition-all duration-200 shadow-lg border-2 border-[#0077B6]/30"><ChevronRightIcon className="h-8 w-8" /></button>
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-medium">{modalSelectedImage + 1} / {productImages.length}</div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isShareModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsShareModalOpen(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-6 border-b border-gray-100"><h3 className="text-lg font-semibold text-gray-900">Share Product</h3><button onClick={() => setIsShareModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><XMarkIcon className="h-5 w-5 text-gray-500" /></button></div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => handleShareOption('native')} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                    <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                      <ShareIcon className="h-6 w-6 text-white" />
                    </div>
                    <span className="text-sm font-medium text-gray-700">Share</span>
                  </button>

                  <button onClick={() => handleShareOption('whatsapp')} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                    <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                      <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-700">WhatsApp</span>
                  </button>

                  <button onClick={() => handleShareOption('copy')} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                    <div className="w-12 h-12 bg-gray-500 rounded-full flex items-center justify-center">
                      <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-700">Copy Link</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isTermsModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[400]"
            onClick={() => setIsTermsModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-gradient-to-br from-[#E0F7FA] to-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden border-2 border-[#00B4D8]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-5 bg-gradient-to-r from-[#00B4D8] to-[#0077B6] text-white">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-7 w-7" />
                  <h3 className="text-xl font-bold">Booking Confirmation</h3>
                </div>
                <button onClick={() => setIsTermsModalOpen(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* Updated Modal Content */}
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                <h4 className="text-xl font-bold text-[#03045E] mb-4">Terms & Conditions</h4>
                <div className="space-y-4 text-sm text-gray-800">

                  <div>
                    <h5 className="font-semibold text-[#0077B6]">1. Ticket Redemption</h5>
                    <ul className="list-disc list-inside pl-4 mt-1 space-y-1 text-gray-600">
                      <li>Please present your e-ticket/coupon at the counter to collect your entry pass.</li>
                      <li>If partial payment was made online, the remaining balance must be paid at the counter.</li>
                    </ul>
                  </div>

                  <div>
                    <h5 className="font-semibold text-[#0077B6]">2. Mode of Payment</h5>
                    <ul className="list-disc list-inside pl-4 mt-1 space-y-1 text-gray-600">
                      <li>The remaining payment can be made in cash / UPI / card (as per waterpark rules).</li>
                    </ul>
                  </div>

                  <div>
                    <h5 className="font-semibold text-[#0077B6]">3. Timings</h5>
                    <ul className="list-disc list-inside pl-4 mt-1 space-y-1 text-gray-600">
                      <li>Entry is valid only for the date and time mentioned on your ticket.</li>
                      <li>Guests are requested to arrive on time; late entry may not be guaranteed.</li>
                    </ul>
                  </div>

                  <div>
                    <h5 className="font-semibold text-[#0077B6]">4. Refund & Cancellation</h5>
                    <ul className="list-disc list-inside pl-4 mt-1 space-y-1 text-gray-600">
                      <li>Refund or cancellation requests must be made at least 24 hours before the visit date.</li>
                      <li>Cancellation and refund policies will follow the respective waterpark’s terms.</li>
                    </ul>
                  </div>

                  <div>
                    <h5 className="font-semibold text-[#0077B6]">5. Park Rules</h5>
                    <ul className="list-disc list-inside pl-4 mt-1 space-y-1 text-gray-600">
                      <li>Drinking, smoking, or carrying prohibited substances is strictly not allowed.</li>
                      <li>Visitors must follow all safety rules, instructions, and dress codes of the waterpark.</li>
                    </ul>
                  </div>

                  <div>
                    <h5 className="font-semibold text-[#0077B6]">6. Disputes</h5>
                    <ul className="list-disc list-inside pl-4 mt-1 space-y-1 text-gray-600">
                      <li>In case of any dispute or misunderstanding, the decision of the waterpark management will be final.</li>
                    </ul>
                  </div>

                  <div>
                    <h5 className="font-semibold text-[#0077B6]">7. Before Entering</h5>
                    <ul className="list-disc list-inside pl-4 mt-1 space-y-1 text-gray-600">
                      <li>Please check your ticket details carefully before entering the waterpark.</li>
                    </ul>
                  </div>

                  <div>
                    <h5 className="font-semibold text-[#0077B6]">8. Agreement</h5>
                    <p className="mt-1 text-gray-600">By clicking “I Accept & Proceed to Pay”, you confirm that you have read and agreed to these <Link to="/policies" className="text-[#0077B6] hover:underline">Terms & Conditions.</Link></p>
                  </div>

                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 p-4 bg-gray-50/80 border-t">
                <button onClick={() => setIsTermsModalOpen(false)} className="px-5 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">
                  Cancel
                </button>
                <button onClick={handleProceedToCheckout} className="px-6 py-2 text-sm font-semibold text-white bg-green-500 rounded-lg hover:bg-green-600 transition-colors shadow-sm">
                  I Accept & Proceed to Pay
                </button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ProductView;