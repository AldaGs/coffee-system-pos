import { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { useMenuStore } from '../../../store/useMenuStore';
import { useDialog } from '../../../hooks/useDialog';
import { useTranslation } from '../../../hooks/useTranslation';
import { toCents, fromCents } from '../../../utils/moneyUtils';

// Recipe Builder. A recipe started from the product form ("+ New recipe") is
// linked back to that product when saved, and the user returns to finish it.
export function useRecipeActions({ setIsSaving, goToTab, linkRecipeToProductForm }) {
  const menuData = useMenuStore((s) => s.menuData);
  const recipes = useMenuStore((s) => s.recipes);
  const setRecipes = useMenuStore((s) => s.setRecipes);
  const { showAlert, showConfirm } = useDialog();
  const { t } = useTranslation();
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [recipeForProductId, setRecipeForProductId] = useState(null);

  const handleCreateDraftRecipe = (name) => {
    const id = `draft_${Date.now()}`;
    setActiveRecipe({
      id,
      name: (typeof name === 'string' && name.trim()) || 'New Recipe Draft',
      linked_menu_item: '',
      target_margin: 25.0,
      custom_price: '',
      ingredients: [],
      isDraft: true,
    });
    return id;
  };

  const handleNewRecipeForProduct = (productName) => {
    setRecipeForProductId(handleCreateDraftRecipe(productName));
    goToTab('calculator');
  };

  const setIngredients = (fn) => {
    if (activeRecipe) setActiveRecipe({ ...activeRecipe, ingredients: fn(activeRecipe.ingredients) });
  };
  const handleAddIngredient = () => setIngredients((list) => [...list, { id: `ing_${Date.now()}`, name: '', cost: '', qty: '' }]);
  const handleUpdateIngredient = (ingId, field, value) => setIngredients((list) => list.map((ing) => (ing.id === ingId ? { ...ing, [field]: value } : ing)));
  const handleDeleteIngredient = (ingId) => setIngredients((list) => list.filter((ing) => ing.id !== ingId));

  const handleSaveRecipeToCloud = async () => {
    if (!activeRecipe) return;
    if (!activeRecipe.name.trim()) return showAlert(t('common.error'), t('recipe.validateNameRequired'));

    setIsSaving(true);
    try {
      const toSave = { ...activeRecipe };
      if (toSave.isDraft) {
        delete toSave.id; // the database assigns the uuid
        delete toSave.isDraft;
      }
      // An empty string in a numeric column fails with 22P02.
      toSave.custom_price = toSave.custom_price === '' || isNaN(toSave.custom_price) ? null : toCents(toSave.custom_price);

      const { data, error } = await supabase.from('recipes').upsert(toSave).select().single();
      if (error) throw error;
      if (data.custom_price) data.custom_price = fromCents(data.custom_price).toString();

      setRecipes(recipes.some((r) => r.id === activeRecipe.id)
        ? recipes.map((r) => (r.id === activeRecipe.id ? data : r))
        : [data, ...recipes.filter((r) => r.id !== activeRecipe.id)]);
      setActiveRecipe(data);

      if (recipeForProductId && recipeForProductId === activeRecipe.id) {
        setRecipeForProductId(null);
        linkRecipeToProductForm(data.id);
        goToTab('menu');
        showAlert(t('common.success'), t('recipe.savedBackToProduct'));
        return;
      }

      // A recipe no item uses does nothing yet, so point at the next step.
      const isSold = Object.values(menuData?.categories || {}).some((items) =>
        (items || []).some((item) => String(item?.linkedRecipeId) === String(data.id)));
      showAlert(t('common.success'), t(isSold ? 'recipe.saveSuccessDesc' : 'recipe.saveSuccessNextStep'));
    } catch (err) {
      console.error(err);
      showAlert(t('admin.dbError'), err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRecipe = (recipeId) => {
    showConfirm(t('recipe.deleteTitle'), t('recipe.deleteDesc'), async () => {
      setIsSaving(true);
      try {
        const { error } = await supabase.from('recipes').delete().eq('id', recipeId);
        if (error) throw error;
        setRecipes(recipes.filter((r) => r.id !== recipeId));
        if (activeRecipe?.id === recipeId) setActiveRecipe(null);
        showAlert(t('common.success'), t('recipe.deleteSuccessDesc'));
      } catch (err) {
        showAlert(t('common.error'), err.message);
      } finally {
        setIsSaving(false);
      }
    });
  };

  return {
    recipes, activeRecipe, setActiveRecipe,
    handleCreateDraftRecipe, handleNewRecipeForProduct,
    handleAddIngredient, handleUpdateIngredient, handleDeleteIngredient,
    handleSaveRecipeToCloud, handleDeleteRecipe,
  };
}
