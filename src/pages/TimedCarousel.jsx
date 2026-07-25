import React from 'react';
import { Carousel, CarouselItem, CarouselCaption } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import "./main.css";

function TimedCarousel({ items }) {
    const hasItems = Boolean(items && items.length > 0);

    if (!hasItems) return null;

    return (
        <Carousel
            className="home-hero-carousel"
            fade
            pause="hover"
            touch
        >
            {items.map((item, index) => (
                <CarouselItem key={item.id || `${item.name}-${index}`} interval={item.interval}>
                    <img
                        className="home-hero-image"
                        src={item.src}
                        alt={item.name}
                    />
                    <CarouselCaption>
                        <h1>{item.name || "Nolan's Knives"}</h1>
                        <p className="home-hero-summary">
                          {item.caption?.trim() || "View available knives or submit a custom request for Nolan to review."}
                        </p>
                        <div className="home-hero-actions">
                          <Link to="/Store" className="home-hero-primary">Shop available knives</Link>
                          <Link to="/custom-knife-request" className="home-hero-secondary">Request a custom knife</Link>
                        </div>
                    </CarouselCaption>
                </CarouselItem>
            ))}
        </Carousel>
    );
}

export default TimedCarousel;
