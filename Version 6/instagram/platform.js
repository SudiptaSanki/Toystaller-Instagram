// extensions/instagram/platform.js
// Instagram platform configuration — sets window.ToystallerActivePlatform (content world)
// and window.ToystallerPlatform (MAIN world for interceptor).

(function() {
    const instagramPlatform = {
        name: 'Instagram',
        version: 'v6.0',
        specialization: 'Dedicated Instagram media extraction for Profile, Post Modals, Feed, Reels, Stories, and DMs.',

        // --- Route & Section Detection ---
        getSection() {
            const path = window.location.pathname.toLowerCase();
            if (this.hasActiveModal()) return 'modal';
            if (path === '/' || path === '') return 'feed';
            if (path.startsWith('/reels') || path.startsWith('/reel/')) return 'reels';
            if (path.startsWith('/stories/')) return 'stories';
            if (path.startsWith('/direct/')) return 'direct';
            if (path.startsWith('/explore/')) return 'explore';
            if (path.startsWith('/p/')) return 'post_standalone';
            return 'profile'; // /<username>/, /<username>/saved/, /<username>/tagged/, etc.
        },

        getPlatformConfig(path) {
            const section = this.getSection();
            if (section === 'modal') {
                return { preferredCorners: ['top-left', 'bottom-left', 'top-right'], padding: 14 };
            }
            if (section === 'reels') {
                return { preferredCorners: ['top-left', 'bottom-left'], padding: 16 };
            }
            if (section === 'stories') {
                return { preferredCorners: ['bottom-left', 'top-left'], padding: 16, topOffset: 48 };
            }
            if (section === 'direct') {
                return { preferredCorners: ['top-left', 'top-right'], padding: 8 };
            }
            if (section === 'profile') {
                return { preferredCorners: ['top-right', 'top-left', 'bottom-right'], padding: 8 };
            }
            return { preferredCorners: ['top-left', 'bottom-left', 'top-right'], padding: 12 };
        },

        hasActiveModal() {
            const dialog = document.querySelector('[role="dialog"], [aria-modal="true"]');
            return dialog !== null && dialog.isConnected;
        },

        getActiveModal() {
            return document.querySelector('[role="dialog"], [aria-modal="true"]');
        },

        isInsideModal(media) {
            if (!media) return false;
            const modal = media.closest('[role="dialog"], [aria-modal="true"]');
            if (modal) return true;
            const dialogs = document.querySelectorAll('[role="dialog"], [aria-modal="true"]');
            for (const d of dialogs) {
                if (d.contains(media)) return true;
            }
            return false;
        },

        isThumbnail(media) {
            if (!media) return true;
            const tagName = media.tagName.toLowerCase();
            const rect = media.getBoundingClientRect();
            const naturalW = media.naturalWidth || media.width || rect.width;
            const naturalH = media.naturalHeight || media.height || rect.height;

            const section = this.getSection();

            // ==========================================
            // 1. MODAL STATE (Post/Reel open in dialog)
            // ==========================================
            if (section === 'modal') {
                if (!this.isInsideModal(media)) {
                    return true;
                }

                if (rect.width < 90 || rect.height < 90) return true;
                if (naturalW < 90 || naturalH < 90) return true;

                const inComments = media.closest('ul:not([class*="carousel" i]), [aria-label*="comment" i], [role="log"]');
                if (inComments) {
                    const isCarouselSlide = media.closest('li[tabindex], li[class*="carousel" i], ul > li:only-child');
                    if (!isCarouselSlide && rect.width < 200) return true;
                }

                const carouselContainer = media.closest('ul, div[style*="overflow"]');
                if (carouselContainer && carouselContainer.children.length > 1) {
                    const cRect = carouselContainer.getBoundingClientRect();
                    const mediaCenterX = rect.left + rect.width / 2;
                    if (mediaCenterX < cRect.left - 20 || mediaCenterX > cRect.right + 20) {
                        return true;
                    }
                }

                const role = (media.getAttribute('role') || '').toLowerCase();
                if (role === 'presentation' || role === 'none') {
                    if (rect.width < 150) return true;
                }

                return false;
            }

            // ==========================================
            // 2. PROFILE PAGE (/<username>/)
            // ==========================================
            if (section === 'profile') {
                const isHeaderAvatar = media.closest('header');
                if (isHeaderAvatar) {
                    if (rect.width < 60 || naturalW < 60) return true;
                    return false;
                }

                const isHighlight = media.closest('[role="menu"], [aria-label*="highlight" i]');
                if (isHighlight) return true;

                const isGridPost = media.closest('a[href^="/p/"], a[href^="/reel/"], article');
                if (isGridPost) {
                    if (rect.width < 80 || rect.height < 80) return true;
                    return false;
                }

                if (rect.width < 120 || rect.height < 120) return true;
                return false;
            }

            // ==========================================
            // 3. REELS PAGE (/reels/, /reel/<id>/)
            // ==========================================
            if (section === 'reels') {
                if (tagName === 'video') {
                    const inViewport = rect.top < window.innerHeight * 0.8 && rect.bottom > window.innerHeight * 0.2;
                    if (!inViewport) return true;
                    if (rect.height < 300) return true;
                    return false;
                }
                if (rect.width < 250) return true;
                return false;
            }

            // ==========================================
            // 4. FEED HOME PAGE (/)
            // ==========================================
            if (section === 'feed') {
                const inStoriesTray = media.closest('[role="menu"], [aria-label*="stories" i], header');
                if (inStoriesTray) return true;

                if (rect.width < 80 || rect.height < 80) return true;

                const inFeedPost = media.closest('article');
                if (inFeedPost) {
                    if (rect.width < 150) return true;
                    return false;
                }

                if (rect.width < 150 || rect.height < 150) return true;
                return false;
            }

            // ==========================================
            // 5. STORIES PAGE (/stories/)
            // ==========================================
            if (section === 'stories') {
                const screenCenterX = window.innerWidth / 2;
                const isCentered = rect.left <= screenCenterX && rect.right >= screenCenterX;
                if (!isCentered) return true;
                if (rect.width < 200) return true;
                return false;
            }

            // ==========================================
            // 6. DIRECT MESSAGES (/direct/)
            // ==========================================
            if (section === 'direct') {
                if (rect.width < 150 || rect.height < 120) return true;
                const inNav = media.closest('[role="list"], [role="listbox"], [role="navigation"]');
                if (inNav) return true;
                const style = window.getComputedStyle(media);
                if (style.borderRadius && (style.borderRadius.includes('50%') || parseInt(style.borderRadius) > 30)) return true;
                return false;
            }

            if (naturalW >= 150 && naturalH >= 150 && rect.width >= 100 && rect.height >= 100) return false;
            return true;
        },

        getButtonScale(media) {
            const section = this.getSection();
            if (section === 'modal') return 1.0;
            if (section === 'reels') return 1.0;
            if (section === 'stories') return 0.9;
            if (section === 'direct') return 0.75;
            if (section === 'profile') {
                const isHeaderAvatar = media.closest('header');
                if (isHeaderAvatar) return 0.8;
                return 0.75;
            }
            const rect = media.getBoundingClientRect();
            const minSide = Math.min(rect.width, rect.height);
            if (minSide < 180) return 0.75;
            if (minSide < 280) return 0.85;
            return 1.0;
        },

        useDirectDownload: false,
        useReactThumbnail: true,

        isInternalUrl(url) {
            const lower = (url || '').toLowerCase();
            return lower.includes('//www.instagram.com') || lower.includes('//instagram.com');
        },

        filterBackgroundUrls(candidates, isVideo) {
            return candidates.filter(u => {
                const lower = u.toLowerCase();
                if (lower.includes('/image/') || lower.includes('.jpg') || lower.includes('.png') || lower.includes('.webp')) return false;
                return lower.includes('cdninstagram.com') || lower.includes('.mp4');
            });
        },

        // --- Interceptor Interface (MAIN world) ---
        getInterceptUrls() {
            return ['instagram.com', 'graph.', '/api/v', 'graphql'];
        },

        shouldSkipReactValue(val, key, isVideoContext) {
            const lowerVal = val.toLowerCase();
            return lowerVal.includes('//www.instagram.com') || lowerVal.includes('//instagram.com');
        },

        looksLikeReactImage(val, key) {
            const lowerVal = val.toLowerCase();
            const lowerKey = key.toLowerCase();
            return (
                lowerKey.includes('image') ||
                lowerKey.includes('thumbnail') ||
                lowerKey.includes('cover') ||
                lowerKey.includes('display_url') ||
                lowerVal.includes('.jpg') ||
                lowerVal.includes('.png') ||
                lowerVal.includes('.webp') ||
                lowerVal.includes('.heic') ||
                lowerVal.includes('/image/') ||
                (lowerVal.includes('cdninstagram.com') && !lowerVal.includes('video'))
            );
        },

        looksLikeReactVideo(val, key) {
            const lowerVal = val.toLowerCase();
            return (lowerVal.includes('cdninstagram.com') && lowerVal.includes('video')) || lowerVal.includes('.mp4');
        },

        extractPriorityReactUrl(val, isVideoContext) {
            if (!val || typeof val !== 'object') return null;

            if (isVideoContext) {
                if (Array.isArray(val.video_versions) && val.video_versions.length > 0) {
                    const valid = val.video_versions.filter(v => v && typeof v.url === 'string' && !v.url.startsWith('blob:'));
                    if (valid.length > 0) {
                        valid.sort((a, b) => (b.height || 0) - (a.height || 0));
                        return valid[0].url;
                    }
                }
                if (typeof val.video_url === 'string' && val.video_url.startsWith('http') && !val.video_url.includes('blob:')) {
                    return val.video_url;
                }
                if (typeof val.videoUrl === 'string' && val.videoUrl.startsWith('http') && !val.videoUrl.includes('blob:')) {
                    return val.videoUrl;
                }
                if (typeof val.playback_url === 'string' && val.playback_url.startsWith('http') && !val.playback_url.includes('blob:')) {
                    return val.playback_url;
                }
                if (typeof val.progressiveUrl === 'string' && val.progressiveUrl.startsWith('http')) {
                    return val.progressiveUrl;
                }
                if (typeof val.streamingUrl === 'string' && val.streamingUrl.startsWith('http')) {
                    return val.streamingUrl;
                }
            } else {
                if (val.image_versions2 && Array.isArray(val.image_versions2.candidates) && val.image_versions2.candidates.length > 0) {
                    const valid = val.image_versions2.candidates.filter(c => c && typeof c.url === 'string' && !c.url.startsWith('blob:'));
                    if (valid.length > 0) {
                        valid.sort((a, b) => (b.width || 0) - (a.width || 0));
                        return valid[0].url;
                    }
                }
                if (typeof val.display_url === 'string' && val.display_url.startsWith('http') && !val.display_url.includes('blob:')) {
                    return val.display_url;
                }
                if (Array.isArray(val.display_resources) && val.display_resources.length > 0) {
                    const valid = val.display_resources.filter(r => r && typeof r.src === 'string' && !r.src.startsWith('blob:'));
                    if (valid.length > 0) {
                        valid.sort((a, b) => (b.config_width || 0) - (a.config_width || 0));
                        return valid[0].src;
                    }
                }
                if (Array.isArray(val.candidates) && val.candidates.length > 0) {
                    const valid = val.candidates.filter(c => c && typeof c.url === 'string' && !c.url.startsWith('blob:'));
                    if (valid.length > 0) {
                        valid.sort((a, b) => (b.width || 0) - (a.width || 0));
                        return valid[0].url;
                    }
                }
            }
            return null;
        },

        extractVideoUrlFromDOM(el) {
            return null;
        }
    };

    if (typeof window !== 'undefined') {
        window.ToystallerPlatforms = window.ToystallerPlatforms || {};
        window.ToystallerPlatforms['instagram'] = instagramPlatform;
        window.ToystallerPlatform = instagramPlatform;
        window.ToystallerActivePlatform = instagramPlatform;
    }
})();
