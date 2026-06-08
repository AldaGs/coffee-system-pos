import MenuArea from './MenuArea';

// CafeLayout — the original "Venta Rápida" fast-sale layout.
//
// This is a thin wrapper around the existing MenuArea (the category tabs +
// product grid). It was extracted verbatim out of Register.jsx as part of the
// dual-layout split so Register can act as a pure controller.
//
// IMPORTANT: this layout owns NO cart/checkout state. It only forwards the menu
// navigation props down to MenuArea, which pushes tapped items into the shared
// cart via PosContext (handleItemClick). The TicketArea (cart, total, pay
// button, 3-dot menu) is rendered by the Register parent alongside whichever
// layout is active, so the checkout math/state hooks are never duplicated.
function CafeLayout({
  activeCategory,
  setActiveCategory,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  setIsSyncModalOpen,
  setIsExpenseModalOpen,
  setIsCorteModalOpen,
}) {
  return (
    <MenuArea
      activeCategory={activeCategory}
      setActiveCategory={setActiveCategory}
      isMobileMenuOpen={isMobileMenuOpen}
      setIsMobileMenuOpen={setIsMobileMenuOpen}
      setIsSyncModalOpen={setIsSyncModalOpen}
      setIsExpenseModalOpen={setIsExpenseModalOpen}
      setIsCorteModalOpen={setIsCorteModalOpen}
    />
  );
}

export default CafeLayout;
