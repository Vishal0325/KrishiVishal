import React, { useState } from 'react';
import { auth, db } from '../firebase/config';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { setDoc, doc } from 'firebase/firestore';
import { ShieldCheck, Mail, Lock, Loader2 } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isNewUser) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          email: email,
          name: email.split('@')[0],
          createdAt: new Date(),
          // Note: role & isAdmin are NOT set here — only Cloud Functions can assign roles
        });
        setError('Request submitted. Ask super admin to enable access for UID: ' + userCredential.user.uid);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(err.message.includes('auth/user-not-found') ? 'Account not found. Create request?' : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f0f4f0]">
      <div className="bg-white p-10 rounded-2xl shadow-2xl w-full max-w-md border border-green-100 animate-in zoom-in duration-300">
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 bg-[#1b5e20] rounded-2xl flex items-center justify-center shadow-lg shadow-green-200 mb-4">
            <ShieldCheck size={36} className="text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-[#1b5e20] tracking-tight">KrishiVishal</h1>
          <p className="text-gray-500 font-medium mt-1 uppercase text-[10px] tracking-[0.2em]">Admin Management System</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-6">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium"
                placeholder="admin@krishivishal.com"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-xs font-semibold border border-red-100 break-all leading-relaxed">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#2e7d32] text-white py-3.5 rounded-xl hover:bg-[#1b5e20] transition-all font-bold text-sm shadow-lg shadow-green-100 flex items-center justify-center space-x-2 active:scale-[0.98] disabled:opacity-70"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : (isNewUser ? 'Create Admin Request' : 'Access Dashboard')}
          </button>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-gray-200"></div>
            <span className="flex-shrink mx-4 text-gray-400 text-[10px] font-bold uppercase">OR</span>
            <div className="flex-grow border-t border-gray-200"></div>
          </div>

          <button
            type="button"
            onClick={() => setIsNewUser(!isNewUser)}
            className="w-full text-gray-500 hover:text-green-700 text-xs font-bold transition-colors"
          >
            {isNewUser ? 'Back to Login' : 'Request Admin Access?'}
          </button>
        </form>

        <p className="mt-8 text-center text-gray-400 text-[10px] font-medium leading-relaxed uppercase">
          Authorized Personnel Only.<br />All activity is monitored and logged.
        </p>
      </div>
    </div>
  );
};

export default Login;
