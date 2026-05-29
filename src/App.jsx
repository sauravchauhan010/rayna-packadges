import React, { useState, useEffect } from 'react';
import { 
  Plane, MapPin, Clock, Download, Plus, Trash2, 
  Settings, Eye, Send, FileText, CheckCircle, Phone, Mail, User, AlertCircle, Database, CloudLightning, Lock, LogOut, KeyRound
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, addDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// Default static fallback packages to populate if database is completely empty on first launch
const SEED_PACKAGES = [
  {
    title: 'SWITZERLAND',
    duration: '03 NIGHTS / 04 DAYS',
    highlight: 'Zurich 3N',
    image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80',
    pdfUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
  },
  {
    title: 'FRANCE',
    duration: '04 NIGHTS / 05 DAYS',
    highlight: 'Paris 4N',
    image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80',
    pdfUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
  },
  {
    title: 'UNITED KINGDOM',
    duration: '05 NIGHTS / 06 DAYS',
    highlight: 'London 5N',
    image: 'https://images.unsplash.com/photo-1513635269975-59663e0ca1ad?auto=format&fit=crop&w=800&q=80',
    pdfUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
  }
];

// --- HARDCODED ADMIN CREDENTIALS ---
const ADMIN_USERNAME = 'admin@smc';
const ADMIN_PASSWORD = 'smctours2026';

// --- FIREBASE CONFIG & INITIALIZATION (Rule 1 & Rule 3) ---
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'smc-tours-portal-v2';

export default function App() {
  const [view, setView] = useState('customer'); // 'customer', 'admin-login', or 'admin'
  const [user, setUser] = useState(null);
  const [packages, setPackages] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [isDbLoading, setIsDbLoading] = useState(true);

  // Authentication Fields
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return sessionStorage.getItem('smc_admin_auth') === 'true';
  });

  // UI Search, Toast & Form States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInquiryPackage, setSelectedInquiryPackage] = useState(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [inquiryForm, setInquiryForm] = useState({ name: '', email: '', phone: '' });
  
  const [formError, setFormError] = useState('');
  const [inquiryError, setInquiryError] = useState('');

  // Form Fields for new Package
  const [newPackage, setNewPackage] = useState({
    title: '',
    duration: '',
    highlight: '',
    image: '',
    pdfUrl: ''
  });

  // 1. One-time Authentication Setup & Admin Route Parser
  useEffect(() => {
    // Basic route query handling: If URL has ?admin, trigger admin screens
    const queryParams = new URLSearchParams(window.location.search);
    const hasAdminQuery = queryParams.has('admin');

    if (hasAdminQuery) {
      if (isLoggedIn) {
        setView('admin');
      } else {
        setView('admin-login');
      }
    } else {
      setView('customer');
    }

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Database connection initialization failed:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      setUser(usr);
    });
    return () => unsubscribe();
  }, [isLoggedIn]);

  // 2. Fetch Active Packages dynamically from Firestore (Rule 1, Rule 2, Rule 3)
  useEffect(() => {
    if (!user) return;

    // Strict path matching Rule 1
    const pkgsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'packages');

    const unsubscribe = onSnapshot(pkgsCollection, async (snapshot) => {
      const list = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });

      // Seeding helper: If the cloud collection is completely empty, populate it with defaults once
      if (list.length === 0 && isDbLoading) {
        try {
          for (const item of SEED_PACKAGES) {
            await addDoc(pkgsCollection, {
              ...item,
              createdAt: new Date().toISOString()
            });
          }
        } catch (seedErr) {
          console.error("Failed to seed initial packages:", seedErr);
        }
      } else {
        // In-memory sorting (Rule 2: avoid orderBy in queries)
        list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        setPackages(list);
        setIsDbLoading(false);
      }
    }, (error) => {
      console.error("Error listening to packages database: ", error);
      setIsDbLoading(false);
    });

    return () => unsubscribe();
  }, [user, isDbLoading]);

  // 3. Fetch Inquiries / Leads from Firestore (Rule 1, Rule 2, Rule 3)
  useEffect(() => {
    if (!user) return;

    const inquiriesCollection = collection(db, 'artifacts', appId, 'public', 'data', 'inquiries');

    const unsubscribe = onSnapshot(inquiriesCollection, (snapshot) => {
      const list = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      // In-memory sorting (Rule 2)
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setInquiries(list);
    }, (error) => {
      console.error("Error listening to inquiries database: ", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Handle Login submission
  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setLoginError('');

    if (usernameInput === ADMIN_USERNAME && passwordInput === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      sessionStorage.setItem('smc_admin_auth', 'true');
      setView('admin');
      // Clear inputs
      setUsernameInput('');
      setPasswordInput('');
    } else {
      setLoginError('Invalid username or password. Please try again.');
    }
  };

  // Handle Logout
  const handleLogout = () => {
    setIsLoggedIn(false);
    sessionStorage.removeItem('smc_admin_auth');
    // Redirect to home (remove parameters safely)
    const url = new URL(window.location);
    url.searchParams.delete('admin');
    window.history.pushState({}, '', url);
    setView('customer');
  };

  // Add Package Handler (Writes to cloud Firestore)
  const handleAddPackage = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!user) {
      setFormError("Connecting to servers. Please wait a moment.");
      return;
    }

    if (!newPackage.title || !newPackage.duration || !newPackage.pdfUrl) {
      setFormError("Please enter a Country Title, Duration, and a valid PDF link.");
      return;
    }

    const docPayload = {
      title: newPackage.title.toUpperCase(),
      duration: newPackage.duration.toUpperCase(),
      highlight: newPackage.highlight || 'Flexible Schedule',
      image: newPackage.image || 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=800&q=80',
      pdfUrl: newPackage.pdfUrl,
      createdAt: new Date().toISOString()
    };

    try {
      const pkgsCol = collection(db, 'artifacts', appId, 'public', 'data', 'packages');
      await addDoc(pkgsCol, docPayload);
      
      // Clear fields on success
      setNewPackage({ title: '', duration: '', highlight: '', image: '', pdfUrl: '' });
    } catch (err) {
      setFormError("Cloud database error: " + err.message);
    }
  };

  // Delete Package Handler (Deletes from cloud Firestore)
  const handleDeletePackage = async (id) => {
    if (!user) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'packages', id);
      await deleteDoc(docRef);
    } catch (err) {
      console.error("Failed to delete package: ", err);
    }
  };

  // Submit Inquiry Handler (Writes customer callback request to cloud Firestore)
  const handleInquirySubmit = async (e) => {
    e.preventDefault();
    setInquiryError('');

    if (!user) {
      setInquiryError("Connecting to database. Please wait.");
      return;
    }

    if (!inquiryForm.name || !inquiryForm.phone) {
      setInquiryError("Please enter your Name and Mobile Number.");
      return;
    }

    const inqPayload = {
      customerName: inquiryForm.name,
      email: inquiryForm.email,
      phone: inquiryForm.phone,
      packageName: selectedInquiryPackage ? selectedInquiryPackage.title : 'General Inquiry',
      createdAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
    };

    try {
      const inqsCol = collection(db, 'artifacts', appId, 'public', 'data', 'inquiries');
      await addDoc(inqsCol, inqPayload);
      
      setShowSuccessToast(true);
      setInquiryForm({ name: '', email: '', phone: '' });

      setTimeout(() => {
        setShowSuccessToast(false);
        setSelectedInquiryPackage(null);
      }, 4000);
    } catch (err) {
      setInquiryError("Failed to upload callback inquiry: " + err.message);
    }
  };

  // Archive / Clear Inquiries Handler
  const handleArchiveInquiry = async (id) => {
    if (!user) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'inquiries', id);
      await deleteDoc(docRef);
    } catch (err) {
      console.error("Failed to archive inquiry:", err);
    }
  };

  const filteredPackages = packages.filter(pkg => 
    pkg.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pkg.highlight.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col selection:bg-purple-600 selection:text-white">
      
      {/* Premium Header */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white shadow-md border-b border-purple-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex justify-between items-center">
          
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => {
            // Remove parameters and redirect customer
            const url = new URL(window.location);
            url.searchParams.delete('admin');
            window.history.pushState({}, '', url);
            setView('customer');
          }}>
            <div className="bg-gradient-to-tr from-purple-600 to-indigo-500 text-white p-2.5 rounded-xl shadow-md transform hover:rotate-6 transition-transform">
              <Plane className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-xl sm:text-2xl font-black tracking-wider uppercase text-white">
                SMC<span className="text-purple-400"> Tours</span>
              </span>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold flex items-center space-x-1">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Live Database Portal</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Display logged-in status or Log Out action if authenticated */}
            {isLoggedIn && (view === 'admin' || view === 'admin-login') && (
              <button 
                onClick={handleLogout}
                className="flex items-center space-x-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            )}

            {/* Display go back to site if on login page */}
            {!isLoggedIn && view === 'admin-login' && (
              <button 
                onClick={() => {
                  const url = new URL(window.location);
                  url.searchParams.delete('admin');
                  window.history.pushState({}, '', url);
                  setView('customer');
                }}
                className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>View Customer Site</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Customer Mode */}
      {view === 'customer' && (
        <main className="flex-1">
          
          {/* Cover Hero Grid */}
          <div className="relative bg-slate-950 text-white min-h-[340px] flex items-center">
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1600&q=80')] bg-cover bg-center opacity-25"></div>
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/85 to-transparent"></div>

            <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-10">
              <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] px-3.5 py-1 rounded-full font-bold uppercase tracking-wider">
                SMC Instant PDF Downloads
              </span>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mt-4">
                Explore the World with <span className="text-purple-400">SMC Tours</span>
              </h1>
              <p className="text-sm sm:text-base text-slate-300 mt-3 max-w-xl mx-auto font-light leading-relaxed">
                Browse our premium holiday layouts below. Download the complete, beautiful PDF package itinerary directly, or submit a custom inquiry callback instantly!
              </p>

              {/* Destination Filter bar */}
              <div className="mt-8 max-w-md mx-auto">
                <div className="relative">
                  <MapPin className="absolute left-4 top-3.5 w-5 h-5 text-purple-400" />
                  <input 
                    type="text" 
                    placeholder="Search countries, regions, or highlights..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white text-slate-900 border-none rounded-2xl py-3.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-purple-400 text-sm font-medium shadow-xl"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Catalog Layout conforming EXACTLY to uploaded specifications */}
          <section className="py-16 bg-slate-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              
              <div className="flex items-center justify-between mb-10">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">SMC Group Departures</h2>
                  <div className="h-1 w-12 bg-purple-600 mt-1"></div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-xs text-slate-500 font-bold bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
                    {filteredPackages.length} packages active
                  </span>
                </div>
              </div>

              {isDbLoading ? (
                <div className="text-center py-24 bg-white rounded-3xl border border-slate-200 p-8 flex flex-col items-center justify-center space-y-4">
                  <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-slate-500 text-sm font-semibold">Connecting to SMC Cloud Storage...</p>
                </div>
              ) : filteredPackages.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-300 p-8">
                  <p className="text-slate-500 text-base">No packages found match your filters.</p>
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="mt-4 bg-purple-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-purple-700 transition cursor-pointer"
                  >
                    Clear Search Filter
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                  {filteredPackages.map((pkg) => (
                    <div 
                      key={pkg.id} 
                      className="bg-white rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 border border-slate-200/80 flex flex-col h-full text-center relative max-w-sm mx-auto w-full group"
                    >
                      {/* Interactive Image Frame */}
                      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                        <img 
                          src={pkg.image} 
                          alt={pkg.title} 
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                        />
                        
                        {/* Overlaid Bottom Blue Banner with Yellow Text (Matches Mockup) */}
                        {pkg.highlight && (
                          <div className="absolute bottom-0 left-0 right-0 bg-[#0d2a5c] text-[#facc15] py-2 text-center font-black text-sm uppercase tracking-wider border-t border-blue-900">
                            {pkg.highlight}
                          </div>
                        )}
                      </div>

                      {/* Content details built EXACTLY like uploaded image */}
                      <div className="p-6 flex-1 flex flex-col justify-between items-center bg-white">
                        
                        <div className="w-full text-center">
                          {/* Deep Violet Bold Country Title */}
                          <h3 className="text-2xl font-extrabold text-[#4c1d95] tracking-wide uppercase font-sans mt-2">
                            {pkg.title}
                          </h3>
                          
                          {/* Duration label */}
                          <p className="text-slate-900 text-sm font-bold tracking-wider mt-2 uppercase">
                            {pkg.duration}
                          </p>

                          {/* Dashed Outline Pill with Highlight (Matches image perfectly) */}
                          <div className="w-full flex justify-center mt-5">
                            <div className="bg-[#e0f2fe]/80 border border-dashed border-slate-800 text-slate-900 font-bold text-xs py-2 px-8 rounded-full min-w-[200px] truncate">
                              {pkg.highlight}
                            </div>
                          </div>
                        </div>

                        {/* Redirection Links (Redirects immediately to PDF URL) */}
                        <div className="mt-8 w-full border-t border-slate-100 pt-5 flex flex-col items-center space-y-3">
                          <a 
                            href={pkg.pdfUrl}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-700 text-sm font-bold tracking-wide flex items-center space-x-1.5 transition-colors group cursor-pointer"
                          >
                            <span>View Full Itinerary</span>
                            <span className="transform group-hover:translate-x-1 transition-transform">→</span>
                          </a>

                          <button 
                            onClick={() => setSelectedInquiryPackage(pkg)}
                            className="text-[11px] text-slate-500 hover:text-purple-600 font-semibold uppercase tracking-wider underline cursor-pointer"
                          >
                            Or Click to request details
                          </button>
                        </div>

                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Minimalist customer callback trigger modal */}
          {selectedInquiryPackage && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
                
                <div className="bg-purple-950 text-white p-6 relative">
                  <h3 className="text-lg font-bold">Request a Callback</h3>
                  <p className="text-slate-300 text-xs mt-1">SMC Package: <span className="text-purple-300 font-bold">{selectedInquiryPackage.title}</span></p>
                  <button 
                    onClick={() => {
                      setSelectedInquiryPackage(null);
                      setInquiryError('');
                    }}
                    className="absolute top-6 right-6 text-slate-400 hover:text-white transition font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {showSuccessToast ? (
                  <div className="p-8 text-center">
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="w-6 h-6" />
                    </div>
                    <h4 className="text-lg font-bold text-slate-950">Inquiry Logged!</h4>
                    <p className="text-slate-600 text-xs mt-2 font-medium">
                      Our SMC Specialist will reach out regarding the <span className="font-semibold text-purple-900">{selectedInquiryPackage.title}</span> program. Thank you!
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleInquirySubmit} className="p-6 space-y-4">
                    {inquiryError && (
                      <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl flex items-center space-x-2 text-xs font-semibold">
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        <span>{inquiryError}</span>
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Your Name *</label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                        <input 
                          type="text" 
                          required
                          value={inquiryForm.name}
                          onChange={(e) => setInquiryForm({...inquiryForm, name: e.target.value})}
                          placeholder="e.g. Rahul Sharma"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Mobile Number *</label>
                      <div className="relative">
                        <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                        <input 
                          type="tel" 
                          required
                          value={inquiryForm.phone}
                          onChange={(e) => setInquiryForm({...inquiryForm, phone: e.target.value})}
                          placeholder="e.g. +91 9876543210"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Email Address (Optional)</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                        <input 
                          type="email" 
                          value={inquiryForm.email}
                          onChange={(e) => setInquiryForm({...inquiryForm, email: e.target.value})}
                          placeholder="e.g. rahul@example.com"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>

                    <div className="pt-4 flex space-x-3">
                      <button 
                        type="button" 
                        onClick={() => {
                          setSelectedInquiryPackage(null);
                          setInquiryError('');
                        }}
                        className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold p-3 rounded-xl transition text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" 
                        className="w-1/2 bg-purple-600 hover:bg-purple-700 text-white font-bold p-3 rounded-xl transition text-xs flex items-center justify-center space-x-1.5 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Callback</span>
                      </button>
                    </div>
                  </form>
                )}

              </div>
            </div>
          )}

          {/* Simple footer */}
          <footer className="bg-slate-900 text-slate-400 py-12 border-t border-slate-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:text-left flex flex-col sm:flex-row justify-between items-center gap-6">
              <div>
                <p className="font-bold text-white uppercase tracking-wider text-xs">SMC TOURS LTD.</p>
                <p className="text-[11px] text-slate-500 mt-1">&copy; 2026 SMC Tours. Custom layouts crafted perfectly for group departures.</p>
              </div>
              <div className="flex space-x-6 text-xs items-center">
                <span className="flex items-center space-x-1.5 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                  <Database className="w-3.5 h-3.5 text-slate-600" />
                  <span>SMC Cloud Connected</span>
                </span>
              </div>
            </div>
          </footer>

        </main>
      )}

      {/* Admin Login View */}
      {view === 'admin-login' && (
        <main className="flex-1 flex items-center justify-center p-6 bg-slate-900">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
            
            {/* Header banner */}
            <div className="bg-gradient-to-br from-purple-900 to-indigo-950 p-8 text-white relative text-center">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Lock className="w-36 h-36" />
              </div>
              <div className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-black uppercase px-3.5 py-1 rounded-full tracking-wider inline-flex items-center space-x-1.5 mx-auto">
                <KeyRound className="w-3 h-3" />
                <span>Protected Terminal</span>
              </div>
              <h2 className="text-2xl font-black mt-3">SMC Control Room</h2>
              <p className="text-slate-300 text-xs mt-1">Please enter your agency credentials to access the package adder dashboard.</p>
            </div>

            <form onSubmit={handleLoginSubmit} className="p-8 space-y-5">
              
              {loginError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3.5 rounded-xl flex items-center space-x-2 text-xs font-semibold">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 animate-bounce" />
                  <span>{loginError}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Username</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <input 
                    type="text"
                    required
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="e.g. admin@smc"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Security Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <input 
                    type="password"
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-900"
                  />
                </div>
              </div>

              {/* Information Hint Banner for Admin Setup */}
              <div className="bg-purple-50 border border-purple-100 p-3.5 rounded-xl text-[11px] text-purple-950">
                <span className="font-extrabold uppercase">Default Credentials:</span>
                <div className="mt-1 font-mono text-[10px]">
                  <div>User: <span className="font-bold select-all">{ADMIN_USERNAME}</span></div>
                  <div>Pass: <span className="font-bold select-all">{ADMIN_PASSWORD}</span></div>
                </div>
              </div>

              <button 
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold p-3.5 rounded-xl transition text-xs flex items-center justify-center space-x-1.5 shadow-md cursor-pointer mt-2"
              >
                <span>Authorize & Enter Dashboard</span>
              </button>
            </form>

          </div>
        </main>
      )}

      {/* Admin Panel (Package Adder Panel) */}
      {view === 'admin' && isLoggedIn && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          
          {/* Cloud Synchronization Notice */}
          <div className="bg-gradient-to-r from-purple-900 to-slate-900 text-white p-4 rounded-2xl shadow-sm mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center space-x-3">
              <div className="bg-purple-800 p-2 rounded-xl">
                <CloudLightning className="w-5 h-5 text-purple-300 animate-pulse" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm sm:text-base">Universal Cloud Synced Dashboard</h3>
                <p className="text-xs text-purple-200">Changes made here are updated live immediately across all devices and customers.</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase px-3 py-1 rounded-full tracking-wider flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-ping"></span>
                <span>Live Database Active</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Form to Add New Package */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                
                <div className="mb-6">
                  <span className="bg-purple-100 text-purple-700 text-[10px] font-black uppercase px-2 py-1 rounded">SMC Creator Control</span>
                  <h2 className="text-xl font-bold text-slate-900 mt-2">Add New Showcase Card</h2>
                  <p className="text-slate-500 text-xs mt-1">Deploy card blocks styled exactly like your physical booklets.</p>
                </div>

                <form onSubmit={handleAddPackage} className="space-y-4">
                  
                  {formError && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl flex items-center space-x-2 text-xs font-semibold">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 animate-bounce" />
                      <span>{formError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Country/Main Title *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. SWITZERLAND"
                      value={newPackage.title}
                      onChange={(e) => setNewPackage({...newPackage, title: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold uppercase tracking-wider text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Duration text *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. 03 NIGHTS / 04 DAYS"
                      value={newPackage.duration}
                      onChange={(e) => setNewPackage({...newPackage, duration: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold tracking-wide text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Highlight / Dashed Tag *</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Zurich 3N"
                      value={newPackage.highlight}
                      onChange={(e) => setNewPackage({...newPackage, highlight: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Card Cover Image URL</label>
                    <input 
                      type="url" 
                      placeholder="Paste cover photo link"
                      value={newPackage.image}
                      onChange={(e) => setNewPackage({...newPackage, image: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium text-slate-900"
                    />
                  </div>

                  <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                    <label className="block text-[11px] font-bold text-purple-950 uppercase tracking-wider mb-1 flex items-center space-x-1">
                      <FileText className="w-3.5 h-3.5 text-purple-600" />
                      <span>Itinerary PDF Link *</span>
                    </label>
                    <input 
                      type="url" 
                      required
                      placeholder="Paste PDF link (Google Drive, Dropbox, Web Server)"
                      value={newPackage.pdfUrl}
                      onChange={(e) => setNewPackage({...newPackage, pdfUrl: e.target.value})}
                      className="w-full bg-white border border-purple-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold text-purple-900"
                    />
                    <p className="text-[10px] text-purple-700/80 mt-1">This link is mapped to the 'View Full Itinerary' redirection button on the card.</p>
                  </div>

                  <button 
                    type="submit"
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold p-3 rounded-xl transition text-xs flex items-center justify-center space-x-1.5 shadow-md cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Publish to Live Cloud Database</span>
                  </button>
                </form>
              </div>

              <div className="bg-gradient-to-br from-slate-900 to-purple-950 text-white p-5 rounded-3xl shadow-sm">
                <h4 className="font-bold text-sm text-purple-300">💡 Custom Card Architecture</h4>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                  These inputs automatically format text to uppercase where needed, place your location tags inside the dashed pill container, and configure direct redirection upon clicking View Itinerary.
                </p>
              </div>
            </div>

            {/* Right Column: Manage Live Catalog & Incoming Inquiries */}
            <div className="lg:col-span-2 space-y-8">
              
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Active Live Packages ({packages.length})</h3>
                
                {isDbLoading ? (
                  <div className="text-center py-10 flex flex-col items-center justify-center space-y-2">
                    <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs text-slate-400">Loading catalog...</span>
                  </div>
                ) : packages.length === 0 ? (
                  <p className="text-xs text-slate-400">No active packages found. Create one using the form on the left!</p>
                ) : (
                  <div className="border border-slate-100 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-center">
                        <tr>
                          <th className="p-3 text-left">Country / Main Title</th>
                          <th className="p-3">Duration</th>
                          <th className="p-3">Highlight</th>
                          <th className="p-3 text-right">Delete</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {packages.map((pkg) => (
                          <tr key={pkg.id} className="hover:bg-slate-50/50 transition">
                            <td className="p-3 flex items-center space-x-3">
                              <img src={pkg.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 bg-slate-100" />
                              <div className="max-w-xs">
                                <span className="font-bold text-slate-900 block uppercase">{pkg.title}</span>
                                <a href={pkg.pdfUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline flex items-center space-x-0.5 mt-0.5 font-semibold">
                                  <FileText className="w-3 h-3 inline" />
                                  <span className="truncate">Attached PDF</span>
                                </a>
                              </div>
                            </td>
                            <td className="p-3 text-center font-medium text-slate-600">{pkg.duration}</td>
                            <td className="p-3 text-center">
                              <span className="bg-blue-50 border border-dashed border-slate-400 text-slate-800 text-[10px] font-bold px-2.5 py-1.5 rounded truncate max-w-[120px] inline-block">
                                {pkg.highlight}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <button 
                                onClick={() => handleDeletePackage(pkg.id)}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Inquiries / Leads box */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-1">Callback Logins</h3>
                <p className="text-slate-500 text-xs mb-4">Real-time leads logging directly from your B2C card inquiries.</p>

                {inquiries.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-xl">No callbacks requested yet.</p>
                ) : (
                  <div className="space-y-3">
                    {inquiries.map((lead) => (
                      <div key={lead.id} className="border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:bg-slate-50 transition">
                        <div>
                          <div className="flex items-center space-x-2">
                            <h4 className="font-extrabold text-slate-900 text-sm">{lead.customerName}</h4>
                            <span className="text-[9px] font-black uppercase bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md">Requested callback</span>
                          </div>
                          
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
                            <span className="flex items-center space-x-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              <span className="text-slate-800 font-semibold">{lead.phone}</span>
                            </span>
                            {lead.email && (
                              <span className="flex items-center space-x-1">
                                <Mail className="w-3 h-3 text-slate-400" />
                                <span>{lead.email}</span>
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-purple-950 font-bold mt-2 bg-purple-50/50 px-2.5 py-1 rounded-md inline-block">
                            Product Interest: {lead.packageName}
                          </p>
                        </div>

                        <div className="text-right flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto">
                          <span className="text-[10px] text-slate-400 font-semibold">{lead.createdAt}</span>
                          <button 
                            onClick={() => handleArchiveInquiry(lead.id)}
                            className="text-xs text-rose-600 hover:text-rose-800 font-bold hover:underline mt-1 cursor-pointer"
                          >
                            Archive Log
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

          </div>

        </main>
      )}

    </div>
  );
}
