import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { storage } from '../../firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const ImageUpload = ({ onUpload, currentImages = [], maxImages = 5, folder = "products" }) => {
  const [uploading, setLoading] = useState(false);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (currentImages.length + acceptedFiles.length > maxImages) {
      toast.error(`Max ${maxImages} images allowed`);
      return;
    }

    setLoading(true);
    const uploadPromises = acceptedFiles.map(async (file) => {
      // Create a unique file name
      const fileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `${folder}/${fileName}`);

      // Upload to Firebase Storage
      const snapshot = await uploadBytes(storageRef, file);

      // Get the download URL
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    });

    try {
      const urls = await Promise.all(uploadPromises);
      onUpload([...currentImages, ...urls]);
      toast.success('Images uploaded to Firebase');
    } catch (error) {
      console.error(error);
      toast.error('Upload failed. Check Firebase Storage rules or network.');
    } finally {
      setLoading(false);
    }
  }, [currentImages, maxImages, onUpload, folder]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {'image/*': []},
    multiple: true
  });

  const removeImage = (urlToRemove) => {
    onUpload(currentImages.filter(url => url !== urlToRemove));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        {currentImages.map((url, i) => (
          <div key={i} className="relative aspect-square rounded-xl overflow-hidden group border border-gray-100 shadow-sm">
            <img src={url} alt="Product" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
            <button
              onClick={() => removeImage(url)}
              className="absolute top-1.5 right-1.5 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:bg-red-600"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        {currentImages.length < maxImages && (
          <div
            {...getRootProps()}
            className={`aspect-square border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer shadow-sm
              ${isDragActive ? 'border-primary bg-green-50' : 'border-gray-200 bg-gray-50 hover:bg-white hover:border-primary-light'}`}
          >
            <input {...getInputProps()} />
            {uploading ? (
              <Loader2 className="animate-spin text-primary" size={24} />
            ) : (
              <>
                <div className="p-3 bg-white rounded-xl shadow-sm mb-2 group-hover:scale-110 transition-transform">
                  <Upload size={20} className="text-gray-400" />
                </div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 text-center">Add Photo</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageUpload;
