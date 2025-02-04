import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import Home from './screens/home';
import { ThemeProvider } from './lib/theme';
import '@mantine/core/styles.css';
import './index.css';

export default function App() {
    return (
        <MantineProvider>
            <ThemeProvider>
                <Router>
                    <Routes>
                        <Route path="/" element={<Home />} />
                    </Routes>
                </Router>
            </ThemeProvider>
        </MantineProvider>
    );
}
