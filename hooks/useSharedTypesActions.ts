import { useState, useEffect } from 'react';
import { DataModel, SharedType, SharedEnum, Field, CodeValue } from '../types';
import { createEmptyField, createEmptyCodeValue, createEmptySharedType, createEmptySharedEnum } from '../utils/factories';

interface UseSharedTypesActionsProps {
  model: DataModel;
  onUpdate: (model: DataModel) => void;
  t: any;
}

export const useSharedTypesActions = ({
  model,
  onUpdate,
  t,
}: UseSharedTypesActionsProps) => {
  const [activeSharedTypeId, setActiveSharedTypeId] = useState<string>('');
  const [activeSharedEnumId, setActiveSharedEnumId] = useState<string>('');

  const sharedTypes = model.sharedTypes || [];
  const sharedEnums = model.sharedEnums || [];

  useEffect(() => {
    if (sharedTypes.length > 0 && !activeSharedTypeId) {
      setActiveSharedTypeId(sharedTypes[0].id);
    }
  }, [sharedTypes, activeSharedTypeId]);

  const activeSharedType = sharedTypes.find((t) => t.id === activeSharedTypeId) || sharedTypes[0];
  const activeSharedEnum = sharedEnums.find((e) => e.id === activeSharedEnumId) || sharedEnums[0];

  // --- SHARED TYPES ---
  const handleAddSharedType = () => {
    const defaultTypeName = t.sharedTypeDefault
      ? `${t.sharedTypeDefault} ${sharedTypes.length + 1}`
      : `Type ${sharedTypes.length + 1}`;
    const newType = createEmptySharedType(defaultTypeName);
    onUpdate({
      ...model,
      sharedTypes: [...sharedTypes, newType],
    });
    setActiveSharedTypeId(newType.id);
  };

  const handleDeleteSharedType = (id: string) => {
    const newTypes = sharedTypes.filter((t) => t.id !== id);
    onUpdate({ ...model, sharedTypes: newTypes });
    if (activeSharedTypeId === id) setActiveSharedTypeId(newTypes[0]?.id || '');
  };

  const handleUpdateSharedType = (updatedType: Partial<SharedType>) => {
    onUpdate({
      ...model,
      sharedTypes: sharedTypes.map((t) =>
        t.id === (activeSharedType?.id || activeSharedTypeId)
          ? { ...t, ...updatedType }
          : t
      ),
    });
  };

  // --- SHARED TYPE PROPERTIES ---
  const handleAddSharedProperty = () => {
    if (!activeSharedType) return;
    handleUpdateSharedType({
      properties: [...activeSharedType.properties, createEmptyField()],
    });
  };

  const handleUpdateSharedProperty = (updatedProp: Field) => {
    if (!activeSharedType) return;
    handleUpdateSharedType({
      properties: activeSharedType.properties.map((p) =>
        p.id === updatedProp.id ? updatedProp : p
      ),
    });
  };

  const handleDeleteSharedProperty = (id: string) => {
    if (!activeSharedType) return;
    handleUpdateSharedType({
      properties: activeSharedType.properties.filter((p) => p.id !== id),
    });
  };

  const handleMoveSharedProperty = (id: string, direction: 'up' | 'down') => {
    if (!activeSharedType) return;
    const index = activeSharedType.properties.findIndex((p) => p.id === id);
    if (index === -1) return;

    const newProps = [...activeSharedType.properties];
    if (direction === 'up' && index > 0) {
      [newProps[index - 1], newProps[index]] = [newProps[index], newProps[index - 1]];
    } else if (direction === 'down' && index < newProps.length - 1) {
      [newProps[index + 1], newProps[index]] = [newProps[index], newProps[index + 1]];
    } else {
      return;
    }
    handleUpdateSharedType({ properties: newProps });
  };

  // --- SHARED ENUMS ---
  const handleAddSharedEnum = () => {
    const newEnum = createEmptySharedEnum();
    onUpdate({ ...model, sharedEnums: [...sharedEnums, newEnum] });
    setActiveSharedEnumId(newEnum.id);
  };

  const handleDeleteSharedEnum = (id: string) => {
    const remaining = sharedEnums.filter((e) => e.id !== id);
    onUpdate({ ...model, sharedEnums: remaining });
    if (activeSharedEnumId === id) setActiveSharedEnumId(remaining[0]?.id || '');
  };

  const handleUpdateSharedEnum = (update: Partial<SharedEnum>) => {
    onUpdate({
      ...model,
      sharedEnums: sharedEnums.map((e) =>
        e.id === (activeSharedEnum?.id || activeSharedEnumId)
          ? { ...e, ...update }
          : e
      ),
    });
  };

  // --- ENUM VALUES ---
  const handleAddEnumValue = () => {
    if (!activeSharedEnum) return;
    handleUpdateSharedEnum({ values: [...activeSharedEnum.values, createEmptyCodeValue()] });
  };

  const handleUpdateEnumValue = (value: CodeValue) => {
    if (!activeSharedEnum) return;
    handleUpdateSharedEnum({
      values: activeSharedEnum.values.map((v) =>
        v.id === value.id ? value : v
      ),
    });
  };

  const handleDeleteEnumValue = (id: string) => {
    if (!activeSharedEnum) return;
    handleUpdateSharedEnum({
      values: activeSharedEnum.values.filter((v) => v.id !== id),
    });
  };

  return {
    // Shared types
    sharedTypes,
    activeSharedType,
    activeSharedTypeId,
    setActiveSharedTypeId,
    handleAddSharedType,
    handleDeleteSharedType,
    handleUpdateSharedType,
    handleAddSharedProperty,
    handleUpdateSharedProperty,
    handleDeleteSharedProperty,
    handleMoveSharedProperty,
    // Shared enums
    sharedEnums,
    activeSharedEnum,
    activeSharedEnumId,
    setActiveSharedEnumId,
    handleAddSharedEnum,
    handleDeleteSharedEnum,
    handleUpdateSharedEnum,
    handleAddEnumValue,
    handleUpdateEnumValue,
    handleDeleteEnumValue,
  };
};
