import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface AnimatedResultProps {
  result: string;
  show: boolean;
}

export function AnimatedResult({ result, show }: AnimatedResultProps) {
  const [displayResult, setDisplayResult] = useState('');

  useEffect(() => {
    if (show && result) {
      setDisplayResult(result);
    }
  }, [result, show]);

  return (
    <AnimatePresence>
      {show && displayResult && (
        <motion.div
          initial={{ opacity: 0, x: +50 }}
          animate={{ opacity: 1, x: +25 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          style={{ 
            position: 'absolute',
            left: '100%',
            top: '70%',
            transform: 'translate(50px, -50%)',
            whiteSpace: 'nowrap',
            color: 'white',
            fontSize: '3.5rem',
            fontFamily: 'Caveat, cursive',
            lineHeight: '1',
            display: 'flex',
            alignItems: 'center',
            height: 'fit-content',
            pointerEvents: 'none'
          }}
        >
          {displayResult}
        </motion.div>
      )}
    </AnimatePresence>
  );
} 