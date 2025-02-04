import { ColorSwatch, Slider, ActionIcon, Tooltip, Menu } from '@mantine/core';
import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import Draggable from 'react-draggable';
import { SWATCHES } from '@/constants';
import { Eraser, Undo2, Redo2, PenLine, Trash2, Calculator, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { AnimatedResult } from '@/components/AnimatedResult';

interface GeneratedResult {
    expression: string;
    answer: string;
    type: 'math' | 'shape' | 'graph' | 'drawing' | 'error';
    position: Point | null;
    color_usage?: Record<string, string>;
}

interface ApiResponseItem {
    expr: string;
    result: string;
    type: 'math' | 'shape' | 'graph' | 'drawing' | 'error';
    assign: boolean;
    color_usage?: Record<string, string>;
}

interface Point {
    x: number;
    y: number;
}

interface EquationPoint {
    start: Point;
    end: Point;
    lastDrawn: Point;
}

interface DrawingState {
    imageData: ImageData | null;
    position: { x: number; y: number };
}

interface ApiResponse {
    status: string;
    data: ApiResponseItem[];
    message: string;
}

export default function Home() {
    const { theme, setTheme } = useTheme();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const [color, setColor] = useState('#FFFFFF');
    const [penSize, setPenSize] = useState(3);
    const [isEraser, setIsEraser] = useState(false);
    const [reset, setReset] = useState(false);
    const [dictOfVars, setDictOfVars] = useState({});
    const [results, setResults] = useState<GeneratedResult[]>([]);
    const [showResult, setShowResult] = useState(false);
    const [latexExpression, setLatexExpression] = useState<Array<{
        latex: string;
        position: Point | null;
    }>>([]);
    const [lastPoint, setLastPoint] = useState<Point | null>(null);
    const [currentEquationStart, setCurrentEquationStart] = useState<Point | null>(null);
    const [equationPoints, setEquationPoints] = useState<EquationPoint[]>([]);
    const [canvasPosition, setCanvasPosition] = useState({ x: 0, y: 0 });
    const [undoStack, setUndoStack] = useState<DrawingState[]>([]);
    const [redoStack, setRedoStack] = useState<DrawingState[]>([]);

    // Add theme colors
    const themeColors = {
        dark: {
            background: '#1A1B1E',
            canvas: '#000000',
            text: '#FFFFFF',
            muted: '#2C2E33'
        },
        light: {
            background: '#F8F9FA',
            canvas: '#FFFFFF',
            text: '#000000',
            muted: '#E9ECEF'
        }
    };

    const currentTheme = theme === 'system' 
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : theme;
    
    const colors = themeColors[currentTheme as 'dark' | 'light'];

    // Optimize image before sending
    const optimizeImage = useCallback((canvas: HTMLCanvasElement): string => {
        const MAX_SIZE = 1024;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        // Create a temporary canvas for resizing
        const tempCanvas = document.createElement('canvas');
        let width = canvas.width;
        let height = canvas.height;

        // Scale down if necessary
        if (width > MAX_SIZE || height > MAX_SIZE) {
            const ratio = Math.min(MAX_SIZE / width, MAX_SIZE / height);
            width *= ratio;
            height *= ratio;
        }

        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return '';

        // Draw and optimize
        tempCtx.drawImage(canvas, 0, 0, width, height);
        return tempCanvas.toDataURL('image/jpeg', 0.8);
    }, []);

    const saveCanvasState = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Save state regardless of content to maintain complete history
        setUndoStack(prev => [...prev, { 
            imageData, 
            position: canvasPosition 
        }]);
        // Clear redo stack when new action is performed
        setRedoStack([]);
    }, [canvasPosition]);

    const resetCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Fill with current theme background
                ctx.fillStyle = colors.canvas;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                setUndoStack([]);
                setRedoStack([]);
                setCanvasPosition({ x: 0, y: 0 });
            }
        }
        setLastPoint(null);
    }, [colors.canvas]);

    const handleUndo = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || undoStack.length === 0) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Save current state to redo stack
        const currentState = {
            imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
            position: canvasPosition
        };
        setRedoStack(prev => [...prev, currentState]);
        
        // Remove the last state from undo stack
        setUndoStack(prev => {
            const newStack = prev.slice(0, -1);
            
            // If we have a previous state, apply it
            if (newStack.length > 0) {
                const previousState = newStack[newStack.length - 1];
                if (previousState.imageData) {
                    ctx.fillStyle = colors.canvas;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.putImageData(previousState.imageData, 0, 0);
                    setCanvasPosition(previousState.position);
                }
            } else {
                // If no previous state, clear to initial state
                ctx.fillStyle = colors.canvas;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                setCanvasPosition({ x: 0, y: 0 });
            }
            return newStack;
        });
    }, [undoStack, canvasPosition, colors.canvas]);

    const handleRedo = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || redoStack.length === 0) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Get the next state from redo stack
        const nextState = redoStack[redoStack.length - 1];
        if (!nextState.imageData) return;
        
        // Save current state to undo stack
        const currentState = {
            imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
            position: canvasPosition
        };
        setUndoStack(prev => [...prev, currentState]);
        
        // Apply the next state
        ctx.fillStyle = colors.canvas;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.putImageData(nextState.imageData, 0, 0);
        setCanvasPosition(nextState.position);
        
        // Remove the applied state from redo stack
        setRedoStack(prev => prev.slice(0, -1));
    }, [redoStack, canvasPosition, colors.canvas]);

    // MathJax setup and canvas initialization
    useEffect(() => {
        if (latexExpression.length > 0 && window.MathJax) {
            setTimeout(() => {
                window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub]);
            }, 0);
        }
    }, [latexExpression]);

    useEffect(() => {
        if (results.length > 0) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const PADDING = 20;

            const newExpressions = results.map((result, index) => {
                const point = result.position;
                if (!point) return {
                    latex: formatLatexResult(result),
                    position: { x: canvasWidth - 300, y: 50 + (index * 60) }
                };

                // Create a temporary div to measure the rendered latex width
                const tempDiv = document.createElement('div');
                tempDiv.style.position = 'absolute';
                tempDiv.style.visibility = 'hidden';
                tempDiv.innerHTML = formatLatexResult(result);
                document.body.appendChild(tempDiv);
                
                const estimatedWidth = tempDiv.offsetWidth + 100;
                document.body.removeChild(tempDiv);

                let adjustedX = point.x + 20;
                let adjustedY = point.y;

                if (adjustedX + estimatedWidth > canvasWidth - PADDING) {
                    adjustedX = canvasWidth - estimatedWidth - PADDING;
                }
                
                adjustedY = Math.max(PADDING, Math.min(canvasHeight - PADDING, adjustedY));

                return {
                    latex: formatLatexResult(result),
                    position: {
                        x: adjustedX,
                        y: adjustedY
                    }
                };
            });
            setLatexExpression(newExpressions);
        }
    }, [results]);

    // Helper function to format LaTeX based on result type
    const formatLatexResult = (result: GeneratedResult) => {
        if (result.type === 'math') {
            return `${result.expression}`;
        }
        return result.expression;
    };

    useEffect(() => {
        if (reset) {
            resetCanvas();
            setLatexExpression([]);
            setResults([]);
            setCurrentEquationStart(null);
            setEquationPoints([]);
            setDictOfVars({});
            setReset(false);
        }
    }, [reset, resetCanvas]);

    // Update canvas background when theme changes
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Store current canvas content
                const currentImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                
                // Fill with new theme background
                ctx.fillStyle = colors.canvas;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Only restore content if it's not empty
                if (currentImageData.data.some(pixel => pixel !== 0)) {
                    ctx.putImageData(currentImageData, 0, 0);
                }
            }
        }
    }, [colors.canvas]);

    // Update the canvas initialization useEffect
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const updateCanvasSize = () => {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    // Store current canvas state
                    const currentImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    
                    // Update canvas size
                    canvas.style.width = '100%';
                    canvas.style.height = '100%';
                    const newWidth = canvas.offsetWidth;
                    const newHeight = canvas.offsetHeight;
                    
                    // Only update dimensions if they've changed
                    if (canvas.width !== newWidth || canvas.height !== newHeight) {
                        canvas.width = newWidth;
                        canvas.height = newHeight;
                        
                        // Fill with current theme background
                        ctx.fillStyle = colors.canvas;
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        
                        // Restore previous canvas state if it exists
                        if (currentImageData.data.some(pixel => pixel !== 0)) {
                            ctx.putImageData(currentImageData, 0, 0);
                        }
                    }
                }
            };

            updateCanvasSize();
            window.addEventListener('resize', updateCanvasSize);

            // Initial canvas setup with theme background
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = colors.canvas;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            // MathJax setup
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.9/MathJax.js?config=TeX-MML-AM_CHTML';
            script.async = true;
            document.head.appendChild(script);

            script.onload = () => {
                window.MathJax.Hub.Config({
                    tex2jax: {inlineMath: [['$', '$'], ['\\(', '\\)']]},
                });
            };

            return () => {
                document.head.removeChild(script);
                window.removeEventListener('resize', updateCanvasSize);
            };
        }
    }, [colors.canvas]);

    const getCanvasPoint = useCallback((e: React.MouseEvent | React.Touch): Point => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }, []);

    const updateDrawingContext = useCallback(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Only update drawing properties
                ctx.lineCap = 'round';
                ctx.lineWidth = penSize;
                if (isEraser) {
                    ctx.globalCompositeOperation = 'destination-out';
                } else {
                    ctx.strokeStyle = color;
                    ctx.globalCompositeOperation = 'source-over';
                }
            }
        }
    }, [color, penSize, isEraser]);

    // Drawing functions
    const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const point = getCanvasPoint('touches' in e ? e.touches[0] : e);
        setLastPoint(point);
        setIsDrawing(true);
        if (!currentEquationStart) {
            setCurrentEquationStart(point);
        }
        updateDrawingContext();

        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.beginPath();
                ctx.moveTo(point.x, point.y);
            }
        }
    }, [getCanvasPoint, updateDrawingContext, currentEquationStart]);

    const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !lastPoint) return;

        const newPoint = getCanvasPoint('touches' in e ? e.touches[0] : e);
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.beginPath();
                ctx.moveTo(lastPoint.x, lastPoint.y);
                ctx.lineTo(newPoint.x, newPoint.y);
                ctx.stroke();
            }
        }
        setLastPoint(newPoint);
    }, [isDrawing, lastPoint, getCanvasPoint]);

    const stopDrawing = useCallback(() => {
        setIsDrawing(false);
        if (lastPoint && currentEquationStart) {
            // Calculate the rightmost x position of the equation
            const rightmostX = Math.max(lastPoint.x, currentEquationStart.x);
            setEquationPoints(prev => [...prev, {
                start: currentEquationStart,
                end: {
                    x: rightmostX,
                    y: lastPoint.y
                },
                lastDrawn: lastPoint
            }]);
        }
        setCurrentEquationStart(null);
        saveCanvasState();
    }, [saveCanvasState, lastPoint, currentEquationStart]);

    // Keyboard event handlers
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.code === 'Space') {
            e.preventDefault();
            setIsPanning(true);
        }
    }, []);

    const handleKeyUp = useCallback((e: KeyboardEvent) => {
        if (e.code === 'Space') {
            e.preventDefault();
            setIsPanning(false);
        }
    }, []);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handleKeyDown, handleKeyUp]);

    const runRoute = useCallback(async () => {
        const canvas = canvasRef.current;
        if (!canvas || equationPoints.length === 0) return;

        setResults([]);
        setLatexExpression([]);

        const optimizedImage = optimizeImage(canvas);
        
        try {
            const response = await axios.post(`${import.meta.env.VITE_API_URL}/calculate`, {
                image: optimizedImage,
                dict_of_vars: dictOfVars
            });

            handleApiResponse(response);
        } catch (error) {
            console.error('Error:', error);
            setResults([{
                expression: 'Error',
                answer: 'Failed to process input',
                type: 'error',
                position: null
            }]);
        }
    }, [dictOfVars, optimizeImage, equationPoints]);

    // Update the LaTeX color when pen color changes
    useEffect(() => {
        if (latexExpression.length > 0) {
            const newExpressions = latexExpression.map(expr => ({
                ...expr,
                latex: expr.latex.replace(/\\color{[^}]*}/, '') // Remove any existing color
                    .replace('\\(\\LARGE{', `\\(\\color{${color}}\\LARGE{`) // Add new color
            }));
            setLatexExpression(newExpressions);
        }
    }, [color]);

    // Update the API response handling
    const handleApiResponse = useCallback(async (response: { data: ApiResponse }) => {
        if (response.data.status === 'success') {
            const newResults = response.data.data.map((item: ApiResponseItem) => ({
                expression: item.expr,
                answer: item.result,
                type: item.type,
                position: lastPoint,
                color_usage: item.color_usage
            }));
            setResults(newResults);
            setShowResult(true);
        }
    }, [lastPoint]);

    return (
        <div className="relative h-screen w-screen overflow-hidden" style={{ backgroundColor: colors.background }}>
            {/* Toolbar */}
            <div className="fixed top-0 left-0 right-0 flex justify-center p-2 sm:p-3 z-50">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg shadow-lg glass max-w-[98vw] sm:max-w-[95vw] md:max-w-fit overflow-x-auto"
                     style={{ backgroundColor: colors.canvas, color: colors.text }}>
                    {/* Color Swatches */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        {SWATCHES.map((swatch) => (
                            <ColorSwatch
                                key={swatch}
                                color={swatch}
                                onClick={() => {
                                    setColor(swatch);
                                    setIsEraser(false);
                                    // Only update context if we're actively drawing
                                    if (isDrawing) {
                                        updateDrawingContext();
                                    }
                                }}
                                size="calc(1.25rem + 1vmin)"
                                className={`cursor-pointer transition-transform hover:scale-110 ${color === swatch ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                            />
                        ))}
                    </div>
                    
                    <div className="h-6 sm:h-8 w-px bg-muted mx-1 sm:mx-2" />
                    
                    {/* Drawing Tools */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Tooltip label="Pen">
                            <ActionIcon
                                variant={!isEraser ? "filled" : "light"}
                                onClick={() => setIsEraser(false)}
                                className={!isEraser ? 'bg-primary text-white hover:bg-primary-hover' : ''}
                                size={`calc(1.75rem + 1vmin)`}
                            >
                                <PenLine className="w-[calc(1rem+0.5vmin)] h-[calc(1rem+0.5vmin)]" />
                            </ActionIcon>
                        </Tooltip>
                        
                        <Tooltip label="Eraser">
                            <ActionIcon
                                variant={isEraser ? "filled" : "light"}
                                onClick={() => setIsEraser(true)}
                                className={isEraser ? 'bg-primary text-white hover:bg-primary-hover' : ''}
                                size={`calc(1.75rem + 1vmin)`}
                            >
                                <Eraser className="w-[calc(1rem+0.5vmin)] h-[calc(1rem+0.5vmin)]" />
                            </ActionIcon>
                        </Tooltip>
                    </div>

                    <div className="h-6 sm:h-8 w-px bg-muted mx-1 sm:mx-2" />
                    
                    {/* Pen Size Slider */}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-[160px] sm:min-w-[200px]">
                        <span className="text-foreground text-xs sm:text-sm font-medium whitespace-nowrap">Size</span>
                        <Tooltip label={`${penSize}px`}>
                            <Slider
                                value={penSize}
                                onChange={(value) => {
                                    setPenSize(value);
                                    // Only update context if we're actively drawing
                                    if (isDrawing) {
                                        updateDrawingContext();
                                    }
                                }}
                                min={1}
                                max={20}
                                step={1}
                                className="flex-1"
                                color="blue"
                                size="md"
                                labelAlwaysOn
                                label={null}
                                styles={{
                                    thumb: {
                                        width: 'calc(var(--spacing-unit) * 5)',
                                        height: 'calc(var(--spacing-unit) * 5)',
                                        backgroundColor: 'var(--background-secondary)',
                                        border: '2px solid var(--primary)',
                                        boxShadow: 'var(--shadow)',
                                        transform: 'translateY(-50%)',
                                        transition: 'width 0.1s ease-out, box-shadow 0.1s ease-out'
                                    },
                                    track: {
                                        height: 'calc(var(--spacing-unit) * 2)',
                                    },
                                    bar: {
                                        height: 'calc(var(--spacing-unit) * 2)',
                                    },
                                    label: {
                                        backgroundColor: 'var(--background-secondary)',
                                        color: 'var(--foreground)',
                                        border: '1px solid var(--border)',
                                        fontSize: '0.75rem',
                                        lineHeight: '1',
                                        padding: '0.25rem 0.5rem',
                                        borderRadius: '0.25rem',
                                        whiteSpace: 'nowrap',
                                        pointerEvents: 'none',
                                        boxShadow: 'var(--shadow)',
                                        top: 'calc(100% + 0.25rem)',
                                        transform: 'translateX(-50%)',
                                        '&::after': {
                                            display: 'none'
                                        }
                                    }
                                }}
                            />
                        </Tooltip>
                    </div>

                    <div className="h-6 sm:h-8 w-px bg-muted mx-1 sm:mx-2" />

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Tooltip label="Undo">
                            <ActionIcon
                                variant="light"
                                onClick={handleUndo}
                                disabled={undoStack.length === 0}
                                size={`calc(1.75rem + 1vmin)`}
                                className="hover:bg-muted-hover"
                            >
                                <Undo2 className="w-[calc(1rem+0.5vmin)] h-[calc(1rem+0.5vmin)]" />
                            </ActionIcon>
                        </Tooltip>
                        
                        <Tooltip label="Redo">
                            <ActionIcon
                                variant="light"
                                onClick={handleRedo}
                                disabled={redoStack.length === 0}
                                size={`calc(1.75rem + 1vmin)`}
                                className="hover:bg-muted-hover"
                            >
                                <Redo2 className="w-[calc(1rem+0.5vmin)] h-[calc(1rem+0.5vmin)]" />
                            </ActionIcon>
                        </Tooltip>

                        <Tooltip label="Clear">
                            <ActionIcon
                                variant="light"
                                onClick={() => setReset(true)}
                                className="text-red-500 hover:bg-red-500/10"
                                size={`calc(1.75rem + 1vmin)`}
                            >
                                <Trash2 className="w-[calc(1rem+0.5vmin)] h-[calc(1rem+0.5vmin)]" />
                            </ActionIcon>
                        </Tooltip>

                        <Tooltip label="Calculate">
                            <ActionIcon
                                variant="filled"
                                onClick={runRoute}
                                className="bg-primary text-white hover:bg-primary-hover"
                                size={`calc(1.75rem + 1vmin)`}
                            >
                                <Calculator className="w-[calc(1rem+0.5vmin)] h-[calc(1rem+0.5vmin)]" />
                            </ActionIcon>
                        </Tooltip>
                    </div>

                    <div className="h-6 sm:h-8 w-px bg-muted mx-1 sm:mx-2" />

                    {/* Theme Toggle */}
                    <Menu position="bottom-end">
                        <Menu.Target>
                            <ActionIcon 
                                variant="light" 
                                size={`calc(1.75rem + 1vmin)`}
                                className="hover:bg-muted-hover"
                            >
                                {theme === 'light' ? (
                                    <Sun className="w-[calc(1rem+0.5vmin)] h-[calc(1rem+0.5vmin)]" />
                                ) : theme === 'dark' ? (
                                    <Moon className="w-[calc(1rem+0.5vmin)] h-[calc(1rem+0.5vmin)]" />
                                ) : (
                                    <Monitor className="w-[calc(1rem+0.5vmin)] h-[calc(1rem+0.5vmin)]" />
                                )}
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                leftSection={<Sun size={16} />}
                                onClick={() => setTheme('light')}
                                className={theme === 'light' ? 'bg-muted' : ''}
                            >
                                Light
                            </Menu.Item>
                            <Menu.Item
                                leftSection={<Moon size={16} />}
                                onClick={() => setTheme('dark')}
                                className={theme === 'dark' ? 'bg-muted' : ''}
                            >
                                Dark
                            </Menu.Item>
                            <Menu.Item
                                leftSection={<Monitor size={16} />}
                                onClick={() => setTheme('system')}
                                className={theme === 'system' ? 'bg-muted' : ''}
                            >
                                System
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </div>
            </div>

            <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-3 md:p-4 mt-[calc(3rem+2vmin)]">
                <div className="w-full h-full max-w-[1920px] mx-auto relative">
                    <Draggable
                        position={canvasPosition}
                        onDrag={(e, data) => setCanvasPosition({ x: data.x, y: data.y })}
                        disabled={!isPanning}
                        bounds="parent"
                    >
                        <div className="w-full h-full">
                            <canvas
                                ref={canvasRef}
                                className="touch-none w-full h-full rounded-lg shadow-lg"
                                style={{
                                    cursor: isPanning ? 'grab' : 'crosshair',
                                    backgroundColor: colors.canvas,
                                    touchAction: 'none',
                                }}
                                onTouchStart={(e: React.TouchEvent<HTMLCanvasElement>) => {
                                    e.preventDefault();
                                    if (e.touches.length === 1) {
                                        startDrawing(e);
                                    }
                                }}
                                onTouchMove={(e: React.TouchEvent<HTMLCanvasElement>) => {
                                    e.preventDefault();
                                    if (e.touches.length === 1) {
                                        draw(e);
                                    }
                                }}
                                onTouchEnd={() => stopDrawing()}
                                onMouseDown={startDrawing}
                                onMouseMove={draw}
                                onMouseUp={stopDrawing}
                                onMouseLeave={stopDrawing}
                            />
                        </div>
                    </Draggable>
                </div>
            </div>

            {/* Render results */}
            <div className="absolute inset-0 pointer-events-none">
                {results.map((result, index) => (
                    <div
                        key={index}
                        style={{
                            position: 'absolute',
                            left: result.position?.x || 0,
                            top: result.position?.y || 0,
                            display: 'flex',
                            alignItems: 'center',
                            height: '60px', // Approximate height of handwritten text
                        }}
                    >
                        <AnimatedResult result={result.answer} show={showResult} />
                    </div>
                ))}
            </div>
        </div>
    );
}
