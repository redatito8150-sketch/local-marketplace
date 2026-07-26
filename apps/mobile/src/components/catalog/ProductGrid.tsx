import { FlatList, FlatListProps } from "react-native";
import { ProductCard } from "./ProductCard";
import { Product } from "@/domain/products";
import { useAppTheme } from "@/theme/ThemeProvider";

export function ProductGrid({ products, ...props }: Omit<FlatListProps<Product>, "data" | "renderItem"> & { products: Product[] }) {
  const { spacing } = useAppTheme();
  return (
    <FlatList
      {...props}
      data={products}
      numColumns={2}
      keyExtractor={(item) => item.id}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={7}
      renderItem={({ item }) => <ProductCard product={item} />}
      columnWrapperStyle={{ gap: spacing.sm }}
      contentContainerStyle={[{ gap: spacing.sm, padding: spacing.md }, props.contentContainerStyle]}
    />
  );
}
