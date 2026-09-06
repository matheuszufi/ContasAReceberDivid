import './Loader.css'
import React from 'react'

// From Uiverse.io by RafaM-dev
export default function Loader() {
  return (
    <section className="loader">
      <div>
        <div>
          <span className="one h6"></span>
          <span className="two h3"></span>
        </div>
      </div>

      <div>
        <div>
          <span className="one h1"></span>
        </div>
      </div>

      <div>
        <div>
          <span className="two h2"></span>
        </div>
      </div>
      <div>
        <div>
          <span className="one h4"></span>
        </div>
      </div>
    </section>
  )
}
