import React, { useState, useEffect } from 'react';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../firebase';
import { X, Image as ImageIcon } from 'lucide-react';

interface PODModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
}

const PODModal: React.FC<PODModalProps> = ({ isOpen, onClose, orderId }) => {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [signUrl, setSignUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !orderId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const fetchMedia = async () => {
      try {
        const photoRef = ref(storage, `deliveries/${orderId}/photo.jpg`);
        const signRef = ref(storage, `signatures/${orderId}/sign.png`);

        const [fetchedPhoto, fetchedSign] = await Promise.allSettled([
          getDownloadURL(photoRef),
          getDownloadURL(signRef)
        ]);

        if (isMounted) {
          if (fetchedPhoto.status === 'fulfilled') setPhotoUrl(fetchedPhoto.value);
          else setPhotoUrl(null);

          if (fetchedSign.status === 'fulfilled') setSignUrl(fetchedSign.value);
          else setSignUrl(null);

          if (fetchedPhoto.status === 'rejected' && fetchedSign.status === 'rejected') {
            setError("POD not uploaded yet or images are missing.");
          }
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError("Failed to fetch POD media.");
          setLoading(false);
        }
      }
    };

    fetchMedia();

    return () => {
      isMounted = false;
    };
  }, [isOpen, orderId]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Proof of Delivery (Order: {orderId})</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div style={{ display: 'flex', gap: '24px' }}>
              <div style={{ flex: 1, height: '300px' }} className="skeleton"></div>
              <div style={{ flex: 1, height: '300px' }} className="skeleton"></div>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              <ImageIcon size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
              <p>{error}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 300px' }}>
                <h4 style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>Delivery Photo</h4>
                {photoUrl ? (
                  <img src={photoUrl} alt="Delivery Proof" style={{ width: '100%', borderRadius: '8px', objectFit: 'cover', height: '300px', backgroundColor: 'var(--surface-color-light)' }} />
                ) : (
                  <div style={{ width: '100%', height: '300px', borderRadius: '8px', backgroundColor: 'var(--surface-color-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>No Photo</div>
                )}
              </div>
              <div style={{ flex: '1 1 300px' }}>
                <h4 style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>Customer Signature</h4>
                {signUrl ? (
                  <img src={signUrl} alt="Signature Proof" style={{ width: '100%', borderRadius: '8px', objectFit: 'contain', height: '300px', backgroundColor: 'var(--surface-color-light)' }} />
                ) : (
                  <div style={{ width: '100%', height: '300px', borderRadius: '8px', backgroundColor: 'var(--surface-color-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>No Signature</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PODModal;
