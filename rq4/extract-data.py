import os
import json
import matplotlib.pyplot as plt
import numpy as np

MAX_VALUE = 40

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

def optimal_bins(data):
    """Compute the optimal number of bins using Freedman-Diaconis Rule."""
    q25, q75 = np.percentile(data, [25, 75])
    iqr = q75 - q25
    bin_width = 2 * iqr / (len(data) ** (1/3))

    if bin_width > 0:
        num_bins = int(np.ceil((max(data) - min(data)) / bin_width))
    else:
        num_bins = 13  # Fallback if data is uniform

    return max(num_bins, 5)  # Ensure at least 5 bins

# def reject_outliers(data, m=2):
#     return list(data[abs(data - np.mean(data)) < m * np.std(data)])

def reject_outliers(data, m=2):
    return list(data[data  < MAX_VALUE])


def gen_histogram(data1, data2, histogram_filename):
    # Create the figure and axes
    fig, ax = plt.subplots(figsize=(8, 6))

    # charon_zeros = [d for d in data2 if d == 0]
    # data2 = [d for d in data2 if not d == 0]

    # data1.append(0)
    data1 = reject_outliers(np.array(data1))
    data2 = reject_outliers(np.array(data2))


    max1 = max(data1)
    max2 = max(data2)
    max_overall = max([max1, max2])

    print(f"MAX_OVERALL = {max_overall}")

    bins = np.linspace(0, max_overall, 13)
    bins[0] = 0.5
    bins = np.insert(bins, 0, -0.5)
    print(bins)

    # nu_bins = max([optimal_bins(data1), optimal_bins(data2)])
    # 
    # nu_bins = min(13, nu_bins)

    # Plot first histogram (red)
    _, edges, _ = ax.hist(data1, bins=bins, color='red', alpha=0.5, label='GASKET')

    # Plot second histogram (blue)
    # ax.hist(charon_zeros, bins=[-0.5, 0.5], color='blue', alpha=0.5, label='CHARON')
    ax.hist(data2, bins=bins, color='blue', alpha=0.5, label='CHARON')

    # Grid and legend
    # ax.grid(True, color='gray', linestyle='--', linewidth=0.5)
    ax.legend()
    plt.xticks(edges)

    # Title and axis labels
    ax.set_title('Overlapping Histograms (Purple Overlap)')
    ax.set_xlabel('Value')
    ax.set_ylabel('Frequency')

    # Save to PDF
    plt.tight_layout()
    plt.savefig(histogram_filename, dpi=300, bbox_inches='tight', transparent=True)
    plt.close()


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
