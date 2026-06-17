import { usePos } from '../../utils/PosContext';
import { formatForDisplay } from '../../utils/moneyUtils';
import { getOrderedVisibleCategories } from '../../utils/categoryUtils';
import RegisterActionBar from './RegisterActionBar';

function MenuArea({
  activeCategory, setActiveCategory,
  isMobileMenuOpen, setIsMobileMenuOpen,
  setIsSyncModalOpen, setIsExpenseModalOpen, setIsCorteModalOpen
}) {
  const { menuData, handleItemClick } = usePos();

  return (
    <main className="menu-area">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', position: 'relative' }}>
        <h2 style={{ margin: 0 }}>{activeCategory}</h2>
        <RegisterActionBar
          isMobileMenuOpen={isMobileMenuOpen}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
          setIsSyncModalOpen={setIsSyncModalOpen}
          setIsExpenseModalOpen={setIsExpenseModalOpen}
          setIsCorteModalOpen={setIsCorteModalOpen}
        />
      </div>

      <div className="category-tabs">
        {(() => {
          const ordered = getOrderedVisibleCategories(menuData);
          return ordered.map(category => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`tab-btn ${activeCategory === category ? 'active' : ''}`}
            >
              {category}
            </button>
          ));
        })()}
      </div>
      
      <div className="menu-grid">
        {(() => {
          // 1. Safe access with fallbacks
          const safeCategories = menuData?.categories || {};
          // Hidden items are dropped from the register too (mirrors the public menu).
          const currentProducts = (safeCategories[activeCategory] || []).filter(item => !item.isHidden);

          // 2. Check if there are actually any categories at all
          if (Object.keys(safeCategories).length === 0) {
            return (
              <div style={{ padding: '40px', textAlign: 'center', color: '#888', gridColumn: '1 / -1' }}>
                <h3>No menu items found.</h3>
                <p>Head over to the Admin dashboard to create your first category!</p>
              </div>
            );
          }

          // 3. If it's safe, map your exact product buttons!
          return currentProducts.map(item => (
            item.imageUrl ? (
              <button key={item.id} onClick={() => handleItemClick(item)} className="item-btn item-btn--photo">
                <span className="item-photo">
                  <img src={item.imageUrl} alt="" loading="lazy" />
                </span>
                <span className="item-photo-info">
                  <span className="item-name">{item.name}</span>
                  <span className="item-price">{formatForDisplay(item.basePrice)}</span>
                </span>
              </button>
            ) : (
              <button key={item.id} onClick={() => handleItemClick(item)} className="item-btn">
                <span className="item-name">{item.emoji || ''} {item.name}</span>
                <span className="item-price">{formatForDisplay(item.basePrice)}</span>
              </button>
            )
          ));
        })()}
      </div>
    </main>
  );
}

export default MenuArea;