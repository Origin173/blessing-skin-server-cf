'use client';

/**
 * 语言切换下拉 (对照 shared/languages.twig)。
 * 切换写 locale cookie 后整页刷新 (与原版 URL 跳转语义一致)。
 */
import React, { useState } from 'react';

interface LanguagesDropdownProps {
  current: string;
  langs: { id: string; name: string }[];
}

export function LanguagesDropdown({ current, langs }: LanguagesDropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <li className="nav-item dropdown">
      <a
        className="nav-link"
        href="#"
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        <i className="fas fa-language" aria-hidden="true" />
        <span className="d-none d-sm-inline">{current}</span>
      </a>
      <div className={`dropdown-menu dropdown-menu-lg dropdown-menu-right${open ? ' show' : ''}`}>
        {langs.map((lang, i) => (
          <React.Fragment key={lang.id}>
            <a
              href="#"
              className="dropdown-item locale"
              onClick={(e) => {
                e.preventDefault();
                document.cookie = `locale=${lang.id};path=/;max-age=31536000`;
                window.location.reload();
              }}
            >
              {lang.name}
            </a>
            {i < langs.length - 1 && <div className="dropdown-divider" />}
          </React.Fragment>
        ))}
      </div>
    </li>
  );
}
