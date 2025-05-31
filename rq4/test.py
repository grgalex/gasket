#!/usr/bin/env python3
import numpy as np
import matplotlib.pyplot as plt

# Generate example data
data1 = np.random.normal(0, 1, 1000)
data2 = np.random.normal(0.5, 1, 1000)

# Create the figure and axes
fig, ax = plt.subplots(figsize=(8, 6))

# Plot first histogram (red)
ax.hist(data1, bins=30, color='red', alpha=0.5, label='Data 1')

# Plot second histogram (blue)
ax.hist(data2, bins=30, color='blue', alpha=0.5, label='Data 2')

# Grid and legend
ax.grid(True, color='gray', linestyle='--', linewidth=0.5)
ax.legend()

# Title and axis labels
ax.set_title('Overlapping Histograms (Purple Overlap)')
ax.set_xlabel('Value')
ax.set_ylabel('Frequency')

# Save to PDF
plt.tight_layout()
plt.savefig('overlapping_histograms.pdf')

print("Saved to overlapping_histograms.pdf")

