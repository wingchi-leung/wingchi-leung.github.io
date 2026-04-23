"use client";

import '../app/globals.css';
import localFont from 'next/font/local'
import RotatingAvatar from './RotatingAvatar';

const bubbleboddy = localFont({
  src: '../public/fonts/bubble-inlie.ttf',
  display: 'swap',
})

const agrandirNarrow = localFont({
  src: '../public/fonts/agrandir-narrow.otf',
  display: 'swap',
})

export default function Navigation() {
  return (
    <nav
      className="py-4 px-4 md:px-6 mb-8 relative"  
      style={{
        backgroundColor: 'rgb(250,249,245)',
      }}
    >
      <div
        className="flex flex-col items-center md:flex-row md:justify-center w-full relative"
      >
        {/* 头像容器 */}
        <div className="nav-avatar">
          <RotatingAvatar />
        </div>
        
        <div
          className={`text-4xl md:text-6xl font-bold text-center mb-4 md:mb-0 ${bubbleboddy.className}`}
          style={{
            color: 'rgb(171, 155, 137)',

          }}
        >
          Wingchi
        </div>
        <div
          className="flex flex-col items-center md:items-start md:ml-8"
        >
          <div
            className={`text-xl md:text-3xl font-bold text-center md:text-left ${agrandirNarrow.className}`}
            style={{
              color: 'rgb(171, 155, 137)',
              fontStyle: 'italic',
              lineHeight: '1.2',
            }}
          >
            Coding, Writing and Shipping
          </div>
        </div>
      </div>
      
    </nav>
  );
}