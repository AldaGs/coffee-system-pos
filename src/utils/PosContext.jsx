// src/utils/PosContext.jsx
import { createContext, useContext } from 'react';

// 1. Create the Context
export const PosContext = createContext();

// 2. Create a custom hook to easily access it later
export const usePos = () => {
  const context = useContext(PosContext);
  if (!context) {
    throw new Error("usePos must be used within a PosProvider");
  }
  return context;
};