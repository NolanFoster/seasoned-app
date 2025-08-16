// Seasoned Recipe App Developer Documentation
// Interactive functionality and navigation

document.addEventListener('DOMContentLoaded', function() {
    // Smooth scrolling for anchor links
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    
    anchorLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                // Calculate offset for fixed header
                const headerHeight = document.querySelector('.header').offsetHeight;
                const targetPosition = targetElement.offsetTop - headerHeight - 20;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
                
                // Update URL without page jump
                history.pushState(null, null, targetId);
                
                // Highlight active navigation item
                highlightActiveNavItem(targetId);
            }
        });
    });
    
    // Highlight active navigation item based on scroll position
    window.addEventListener('scroll', function() {
        const sections = document.querySelectorAll('.section');
        const scrollPosition = window.scrollY + 100; // Offset for header
        
        let currentSection = '';
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            
            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                currentSection = '#' + section.getAttribute('id');
            }
        });
        
        if (currentSection) {
            highlightActiveNavItem(currentSection);
        }
    });
    
    // Highlight active navigation item
    function highlightActiveNavItem(activeId) {
        // Remove active class from all nav items
        const navItems = document.querySelectorAll('.nav-section a');
        navItems.forEach(item => {
            item.classList.remove('active');
        });
        
        // Add active class to current item
        const activeItem = document.querySelector(`.nav-section a[href="${activeId}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }
    }
    
    // Add active class styling
    const style = document.createElement('style');
    style.textContent = `
        .nav-section a.active {
            background-color: #667eea !important;
            color: white !important;
            font-weight: 500;
        }
    `;
    document.head.appendChild(style);
    
    // Mobile navigation toggle
    const mobileNavToggle = document.createElement('button');
    mobileNavToggle.className = 'mobile-nav-toggle';
    mobileNavToggle.innerHTML = '☰';
    mobileNavToggle.style.cssText = `
        display: none;
        position: fixed;
        top: 1rem;
        right: 1rem;
        z-index: 1000;
        background: #667eea;
        color: white;
        border: none;
        border-radius: 0.375rem;
        padding: 0.5rem;
        font-size: 1.25rem;
        cursor: pointer;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    `;
    
    document.body.appendChild(mobileNavToggle);
    
    // Mobile navigation functionality
    let mobileNavOpen = false;
    
    mobileNavToggle.addEventListener('click', function() {
        const sidebar = document.querySelector('.sidebar');
        
        if (mobileNavOpen) {
            sidebar.style.transform = 'translateX(-100%)';
            mobileNavToggle.innerHTML = '☰';
        } else {
            sidebar.style.transform = 'translateX(0)';
            mobileNavToggle.innerHTML = '✕';
        }
        
        mobileNavOpen = !mobileNavOpen;
    });
    
    // Add mobile styles
    const mobileStyle = document.createElement('style');
    mobileStyle.textContent = `
        @media (max-width: 1024px) {
            .sidebar {
                position: fixed;
                top: 0;
                left: 0;
                width: 280px;
                height: 100vh;
                z-index: 999;
                transform: translateX(-100%);
                transition: transform 0.3s ease;
                background: white;
                box-shadow: 2px 0 10px rgba(0, 0, 0, 0.1);
            }
            
            .mobile-nav-toggle {
                display: block !important;
            }
            
            .main-content {
                margin-left: 0;
            }
        }
        
        @media (min-width: 1025px) {
            .mobile-nav-toggle {
                display: none !important;
            }
        }
    `;
    document.head.appendChild(mobileStyle);
    
    // Close mobile nav when clicking outside
    document.addEventListener('click', function(e) {
        if (mobileNavOpen && !e.target.closest('.sidebar') && !e.target.closest('.mobile-nav-toggle')) {
            const sidebar = document.querySelector('.sidebar');
            sidebar.style.transform = 'translateX(-100%)';
            mobileNavToggle.innerHTML = '☰';
            mobileNavOpen = false;
        }
    });
    
    // Add search functionality
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.style.cssText = `
        margin-bottom: 2rem;
        position: relative;
    `;
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search documentation...';
    searchInput.className = 'search-input';
    searchInput.style.cssText = `
        width: 100%;
        padding: 0.75rem 1rem;
        border: 2px solid #e2e8f0;
        border-radius: 0.5rem;
        font-size: 1rem;
        outline: none;
        transition: border-color 0.2s ease;
    `;
    
    searchContainer.appendChild(searchInput);
    
    // Insert search before first section
    const firstSection = document.querySelector('.section');
    if (firstSection) {
        firstSection.parentNode.insertBefore(searchContainer, firstSection);
    }
    
    // Search functionality
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        const sections = document.querySelectorAll('.section');
        
        sections.forEach(section => {
            const text = section.textContent.toLowerCase();
            const title = section.querySelector('h2')?.textContent.toLowerCase() || '';
            
            if (text.includes(searchTerm) || title.includes(searchTerm)) {
                section.style.display = 'block';
                section.style.opacity = '1';
            } else {
                section.style.display = 'none';
                section.style.opacity = '0';
            }
        });
        
        // Show/hide "no results" message
        const visibleSections = Array.from(sections).filter(section => 
            section.style.display !== 'none'
        );
        
        let noResultsMsg = document.querySelector('.no-results');
        
        if (visibleSections.length === 0 && searchTerm) {
            if (!noResultsMsg) {
                noResultsMsg = document.createElement('div');
                noResultsMsg.className = 'no-results';
                noResultsMsg.innerHTML = `
                    <div style="text-align: center; padding: 3rem; color: #64748b;">
                        <h3>No results found</h3>
                        <p>Try searching for different terms or browse the navigation.</p>
                    </div>
                `;
                searchContainer.parentNode.insertBefore(noResultsMsg, searchContainer.nextSibling);
            }
        } else if (noResultsMsg) {
            noResultsMsg.remove();
        }
    });
    
    // Add search input focus styles
    const searchStyles = document.createElement('style');
    searchStyles.textContent = `
        .search-input:focus {
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        
        .no-results {
            background: white;
            border-radius: 0.75rem;
            box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
            margin-bottom: 2rem;
        }
    `;
    document.head.appendChild(searchStyles);
    
    // Add copy code functionality
    const codeBlocks = document.querySelectorAll('pre code');
    
    codeBlocks.forEach(block => {
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-button';
        copyButton.innerHTML = '📋';
        copyButton.title = 'Copy code';
        copyButton.style.cssText = `
            position: absolute;
            top: 0.5rem;
            right: 0.5rem;
            background: rgba(30, 41, 59, 0.8);
            color: white;
            border: none;
            border-radius: 0.25rem;
            padding: 0.25rem 0.5rem;
            cursor: pointer;
            font-size: 0.75rem;
            transition: background-color 0.2s ease;
        `;
        
        copyButton.addEventListener('mouseenter', function() {
            this.style.backgroundColor = 'rgba(30, 41, 59, 1)';
        });
        
        copyButton.addEventListener('mouseleave', function() {
            this.style.backgroundColor = 'rgba(30, 41, 59, 0.8)';
        });
        
        copyButton.addEventListener('click', function() {
            const text = block.textContent;
            navigator.clipboard.writeText(text).then(() => {
                const originalText = this.innerHTML;
                this.innerHTML = '✅';
                this.style.backgroundColor = '#059669';
                
                setTimeout(() => {
                    this.innerHTML = originalText;
                    this.style.backgroundColor = 'rgba(30, 41, 59, 0.8)';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
                this.innerHTML = '❌';
                this.style.backgroundColor = '#dc2626';
                
                setTimeout(() => {
                    this.innerHTML = '📋';
                    this.style.backgroundColor = 'rgba(30, 41, 59, 0.8)';
                }, 2000);
            });
        });
        
        // Make pre elements relative for absolute positioning
        const preElement = block.closest('pre');
        if (preElement) {
            preElement.style.position = 'relative';
            preElement.appendChild(copyButton);
        }
    });
    
    // Add table of contents for long sections
    const longSections = document.querySelectorAll('.section');
    
    longSections.forEach(section => {
        const headings = section.querySelectorAll('h3, h4');
        
        if (headings.length > 3) {
            const toc = document.createElement('div');
            toc.className = 'table-of-contents';
            toc.style.cssText = `
                background: #f8fafc;
                padding: 1.5rem;
                border-radius: 0.5rem;
                border: 1px solid #e2e8f0;
                margin: 1.5rem 0;
            `;
            
            const tocTitle = document.createElement('h4');
            tocTitle.textContent = '📋 Table of Contents';
            tocTitle.style.cssText = `
                margin-bottom: 1rem;
                color: #1e293b;
                font-size: 1.125rem;
            `;
            
            const tocList = document.createElement('ul');
            tocList.style.cssText = `
                margin: 0;
                padding-left: 1.5rem;
                color: #475569;
            `;
            
            headings.forEach(heading => {
                const listItem = document.createElement('li');
                const link = document.createElement('a');
                
                link.textContent = heading.textContent;
                link.href = '#' + heading.id;
                link.style.cssText = `
                    color: #475569;
                    text-decoration: none;
                    font-size: 0.875rem;
                `;
                
                link.addEventListener('click', function(e) {
                    e.preventDefault();
                    const targetId = this.getAttribute('href');
                    const targetElement = document.querySelector(targetId);
                    
                    if (targetElement) {
                        const headerHeight = document.querySelector('.header').offsetHeight;
                        const targetPosition = targetElement.offsetTop - headerHeight - 20;
                        
                        window.scrollTo({
                            top: targetPosition,
                            behavior: 'smooth'
                        });
                    }
                });
                
                listItem.appendChild(link);
                tocList.appendChild(listItem);
            });
            
            toc.appendChild(tocTitle);
            toc.appendChild(tocList);
            
            // Insert TOC after the section title
            const sectionTitle = section.querySelector('h2');
            if (sectionTitle) {
                sectionTitle.parentNode.insertBefore(toc, sectionTitle.nextSibling);
            }
        }
    });
    
    // Add "back to top" button
    const backToTopButton = document.createElement('button');
    backToTopButton.className = 'back-to-top';
    backToTopButton.innerHTML = '↑';
    backToTopButton.title = 'Back to top';
    backToTopButton.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: #667eea;
        color: white;
        border: none;
        border-radius: 50%;
        width: 3rem;
        height: 3rem;
        font-size: 1.5rem;
        cursor: pointer;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
        z-index: 1000;
    `;
    
    document.body.appendChild(backToTopButton);
    
    // Show/hide back to top button
    window.addEventListener('scroll', function() {
        if (window.scrollY > 300) {
            backToTopButton.style.opacity = '1';
            backToTopButton.style.visibility = 'visible';
        } else {
            backToTopButton.style.opacity = '0';
            backToTopButton.style.visibility = 'hidden';
        }
    });
    
    // Back to top functionality
    backToTopButton.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
    
    // Add hover effect for back to top button
    backToTopButton.addEventListener('mouseenter', function() {
        this.style.transform = 'scale(1.1)';
        this.style.background = '#5a67d8';
    });
    
    backToTopButton.addEventListener('mouseleave', function() {
        this.style.transform = 'scale(1)';
        this.style.background = '#667eea';
    });
    
    // Initialize with first section active
    if (window.location.hash) {
        highlightActiveNavItem(window.location.hash);
    } else {
        highlightActiveNavItem('#introduction');
    }
    
    console.log('🍳 Seasoned Recipe App Documentation loaded successfully!');
});
