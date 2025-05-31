import os
import json
import matplotlib.pyplot as plt
import numpy as np


def get_data():
    data_jsxray = []
    data_charon = []

    with open('jsxray_samples.json', 'r') as infile:
        data_jsxray = json.loads(infile.read())

    with open('charon_samples.json', 'r') as infile:
        data_charon = json.loads(infile.read())

    return [
        {
            "samples": data_jsxray,
            "description": "GASKET",
        },
        {
            "samples": data_charon,
            "description": "CHARON",
        }
    ]

def reject_outliers(data, m=2):
    return list(data[abs(data - np.mean(data)) < m * np.std(data)])

def gen_histogram(data1, data2, histogram_filename):
    # Create the figure and axes
    fig, ax = plt.subplots(figsize=(8, 6))

    data1 = reject_outliers(np.array(data1))
    data2 = reject_outliers(np.array(data2))


    max1 = max(data1)
    max2 = max(data2)
    max_overall = max([max1, max2])

    print(f"MAX_OVERALL = {max_overall}")

    bins = np.linspace(0, max_overall, 13)

    # Plot first histogram (red)
    ax.hist(data1, bins=bins, color='red', alpha=0.5, label='GASKET')

    # Plot second histogram (blue)
    ax.hist(data2, bins=bins, color='blue', alpha=0.5, label='CHARON')

    # Grid and legend
    ax.grid(True, color='gray', linestyle='--', linewidth=0.5)
    ax.legend()

    # Title and axis labels
    ax.set_title('Overlapping Histograms (Purple Overlap)')
    ax.set_xlabel('Value')
    ax.set_ylabel('Frequency')

    # Save to PDF
    plt.tight_layout()
    plt.savefig(histogram_filename, dpi=300, bbox_inches='tight', transparent=True)
    plt.close()


# def generate_histogram(samples, use_log, histogram_filename):
#     """Generate histogram and save it as a PDF without white space."""
#     plt.figure(figsize=(4, 1))  # Fixed height (1 inch)
#
#     nu_bins = len(set(samples))
#     if use_log:
#         new_samples = []
#         for s in samples:
#             if s < 1:
#                 new_samples.append(s + 1)
#             else:
#                 new_samples.append(s)
#         samples = new_samples
#         plt.xscale('log')
#         bins = np.logspace(np.log10(min(samples)), np.log10(max(samples)), 20)
#     else:
#         if nu_bins > 12:
#             nu_bins = 12
#         bins = np.linspace(min(samples), max(samples), nu_bins + 1)
#
#     # Create histogram
#     # bins = optimal_bins(samples)
#
#     plt.hist(samples, bins=bins, color='red', edgecolor='white', linewidth=0.8)
#
#     # Remove all axis labels and ticks
#     plt.xticks([])  # Remove xticks
#     plt.yticks([])  # Remove yticks
#     plt.gca().spines['top'].set_visible(False)  # Remove top spine
#     plt.gca().spines['right'].set_visible(False)  # Remove right spine
#     plt.gca().spines['left'].set_visible(False)  # Remove left spine
#     plt.gca().spines['bottom'].set_visible(False)  # Remove bottom spine
#
#     plt.gca().tick_params(axis='x', which='both', bottom=False, top=False)  # Hides all x ticks
#     plt.gca().tick_params(axis='y', which='both', left=False, right=False)  # Hides all y ticks
#     # Set the limits to be tight around the bars, no padding
#     plt.xlim(min(samples), max(samples))  # Limit x-axis to the range of the samples
#     plt.ylim(0, np.max(np.histogram(samples, bins=bins)[0]))  # Limit y-axis to the maximum frequency
#
#     # Use tight_layout to remove extra space around the plot
#     plt.tight_layout(pad=0)  # Ensure no padding around the plot
#
#     # Save histogram as PDF with tight bounding box to remove white space around it
#     plt.savefig(histogram_filename, dpi=300, bbox_inches='tight', transparent=True)
#     plt.close()
#


def generate_latex_table(sample_data):
    """Generate LaTeX code for the table with histograms."""
    latex_code = """
\\documentclass{article}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{array}
\\usepackage{lscape}

\\begin{document}

\\begin{table}[h]
    \\centering
    \\renewcommand{\\arraystretch}{0.8}  % Reduce row height by scaling to 80% of the default
    \\begin{tabular}{lrrrr}
        \\hline
        Description & 5\\% & Mean & Median & 95\\% \\\\
        \\hline
    """

    for i, data in enumerate(sample_data):
        samples, description = data["samples"], data['description']

        # Calculate statistics
        percentile_5 = np.percentile(samples, 5)
        mean = np.mean(samples)
        median = np.median(samples)
        percentile_95 = np.percentile(samples, 95)

        # Add row to the LaTeX table with fixed-width histogram
        latex_code += f"""
        {description} & {percentile_5:.2f} & {mean:.2f} & {median:.2f} & {percentile_95:.2f} \\\\
    """

    latex_code += """
    \\end{tabular}
    \\caption{Summary statistics for bridges found by each mechanism.}
    \\label{tab:bridges}
\\end{table}

\\end{document}
"""
    return latex_code

data = get_data()
table = generate_latex_table(data)
if not os.path.exists('histograms'):
    os.makedirs('histograms')
histogram = gen_histogram(data[0]['samples'], data[1]['samples'], 'bridges_histogram.pdf')
print(table)
