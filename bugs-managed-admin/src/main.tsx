import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ConfigProvider
        theme={{
          // Default (non-compact) algorithm. We dropped compactAlgorithm
          // and bumped fontSize from 13 to 16 — Larry asked for ~20%
          // larger text platform-wide for easier reading. Auto-sizing
          // columns on the tickets table keeps the row from overflowing
          // at the new size, with horizontal scroll if the viewport is
          // narrow.
          algorithm: [theme.darkAlgorithm],
          token: {
            colorPrimary: '#4caf50',
            borderRadius: 8,
            fontSize: 16,
            // Move off pure black for the body — pure black washes out
            // antd's dark-mode tag tints (especially blue/cyan), which
            // become near-invisible against #000. A slightly lifted dark
            // navy gives every tinted element more contrast room.
            colorBgBase: '#0f1218',
            colorBgLayout: '#0f1218',
            colorBgContainer: '#161b25',
            colorBgElevated: '#1c2230',
            // Full-strength white for primary text. Grid cells inherit
            // colorText so this also covers the request to make all
            // grid font white.
            colorText: '#ffffff',
            colorTextSecondary: 'rgba(255,255,255,0.85)',
            colorTextTertiary: 'rgba(255,255,255,0.65)',
            colorTextDisabled: 'rgba(255,255,255,0.45)',
            // Stronger split lines so columns don't blur together.
            colorBorder: 'rgba(255,255,255,0.20)',
            colorBorderSecondary: 'rgba(255,255,255,0.12)',
          },
          components: {
            Table: {
              cellPaddingBlockSM: 8,
              cellPaddingInlineSM: 10,
              headerBg: '#1a2336',
              headerColor: '#ffffff',
              colorText: '#ffffff',
              rowHoverBg: 'rgba(255,255,255,0.06)',
              borderColor: 'rgba(255,255,255,0.12)',
              // Grid-only font size — keep page headers and banners at
              // the 16px base, but pull grid rows down to 15 so dense
              // ticket lists scan more comfortably.
              fontSize: 15,
            },
            Tag: {
              // Brighten antd preset tags. The default dark-mode
              // backgrounds are ~10% alpha and the text is muted —
              // unreadable on a near-black panel. Push both up.
              defaultBg: 'rgba(255,255,255,0.12)',
              defaultColor: 'rgba(255,255,255,0.92)',
            },
            Select: {
              // Selected value needs to read clearly against the dark
              // dropdown bg; bump the contrast.
              colorTextPlaceholder: 'rgba(255,255,255,0.55)',
              optionSelectedBg: 'rgba(76,175,80,0.18)',
              optionSelectedColor: 'rgba(255,255,255,0.96)',
            },
            Card: {
              colorBgContainer: '#161b25',
            },
            Layout: {
              bodyBg: '#0f1218',
              headerBg: '#0a0d14',
            },
          },
        }}
      >
        <App />
      </ConfigProvider>
    </BrowserRouter>
  </React.StrictMode>
);
