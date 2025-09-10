'use client';

import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export function WalletButton() {
  return (
    <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700 !rounded-lg !text-white !font-semibold !px-6 !py-3 !transition-colors" />
  );
}

export function WalletInfo() {
  const { publicKey, connected } = useWallet();

  if (!connected || !publicKey) {
    return null;
  }

  return (
    <div className="text-sm text-gray-600">
      Connected: {publicKey.toBase58().slice(0, 8)}...{publicKey.toBase58().slice(-8)}
    </div>
  );
}
