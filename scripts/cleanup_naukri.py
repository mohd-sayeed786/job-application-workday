import re

def main():
    file_path = "/Users/mohammadsayeed/PycharmProjects/job-apply-plugin/scripts/naukri_apply.mjs"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Replace literal \${ with ${
    cleaned = re.sub(r'\\(\$\{[a-zA-Z0-9_\. +{}/\'"-]+?\})', r'\1', content)
    cleaned = cleaned.replace("\\${", "${")
    cleaned = cleaned.replace("\\d${", "${")

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(cleaned)

    print("SUCCESS: Cleaned up backslashes in naukri_apply.mjs!")

if __name__ == "__main__":
    main()
